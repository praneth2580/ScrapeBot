import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AIError } from "./errors";

/**
 * Local secret storage for AI provider credentials.
 *
 * Prefer OS keychain in the future; this file-backed store is the documented
 * local-only fallback with restrictive permissions (0600 files, 0700 dir).
 *
 * Secrets are NEVER written to AI settings JSON or returned to the frontend.
 */

function defaultSecretsDir() {
  const dataDir =
    process.env.SCRAPEBOT_DATA_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  return path.join(dataDir, "secrets");
}

export type SecretStore = {
  set(ref: string, value: string): Promise<void>;
  get(ref: string): Promise<string | undefined>;
  has(ref: string): Promise<boolean>;
  delete(ref: string): Promise<void>;
  listRefs(): Promise<string[]>;
};

function assertSafeRef(ref: string) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.includes("..")) {
    throw new AIError(`Invalid secret reference: ${ref}`, {
      code: "CONFIG_INVALID",
    });
  }
}

function resolveSecretsDir(): string {
  return process.env.WEBPILOT_SECRETS_DIR || defaultSecretsDir();
}

function ensureSecretsDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Best-effort on platforms that ignore chmod
  }
}

function secretPath(dir: string, ref: string): string {
  assertSafeRef(ref);
  const safe = ref.replace(/\//g, "__");
  return path.join(dir, `${safe}.secret`);
}

/**
 * Optional obfuscation at rest (not a substitute for OS keychain).
 * Uses a machine-local key derived from WEBPILOT_SECRET_KEY or a file key.
 */
function getOrCreateLocalKey(dir: string): Buffer {
  const envKey = process.env.WEBPILOT_SECRET_KEY;
  if (envKey && envKey.length >= 16) {
    return crypto.createHash("sha256").update(envKey).digest();
  }

  const keyPath = path.join(dir, ".local-key");
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }

  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // ignore
  }
  return key;
}

function encrypt(dir: string, plaintext: string): string {
  const key = getOrCreateLocalKey(dir);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(dir: string, payload: string): string {
  const key = getOrCreateLocalKey(dir);
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8"
  );
}

export function createFileSecretStore(
  secretsDir = resolveSecretsDir()
): SecretStore {
  ensureSecretsDir(secretsDir);

  return {
    async set(ref, value) {
      const file = secretPath(secretsDir, ref);
      const encoded = encrypt(secretsDir, value);
      fs.writeFileSync(file, encoded, { mode: 0o600 });
      try {
        fs.chmodSync(file, 0o600);
      } catch {
        // ignore
      }
    },

    async get(ref) {
      const file = secretPath(secretsDir, ref);
      if (!fs.existsSync(file)) return undefined;
      try {
        const raw = fs.readFileSync(file, "utf8").trim();
        return decrypt(secretsDir, raw);
      } catch {
        throw new AIError(`Failed to read secret "${ref}".`, {
          code: "SECRET_MISSING",
        });
      }
    },

    async has(ref) {
      return fs.existsSync(secretPath(secretsDir, ref));
    },

    async delete(ref) {
      const file = secretPath(secretsDir, ref);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    },

    async listRefs() {
      ensureSecretsDir(secretsDir);
      return fs
        .readdirSync(secretsDir)
        .filter((f) => f.endsWith(".secret"))
        .map((f) => f.replace(/\.secret$/, "").replace(/__/g, "/"));
    },
  };
}

/** Resolve API key from secret store or environment variable fallback for CI. */
export async function resolveProviderSecret(
  store: SecretStore,
  secretRef: string | undefined,
  envFallbackNames: string[] = []
): Promise<string | undefined> {
  if (secretRef) {
    const fromStore = await store.get(secretRef);
    if (fromStore) return fromStore;
  }

  for (const name of envFallbackNames) {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }

  return undefined;
}

export function providerSecretRef(providerId: string): string {
  return `providers/${providerId}/apiKey`;
}
