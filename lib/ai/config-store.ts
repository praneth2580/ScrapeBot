import fs from "node:fs";
import path from "node:path";
import {
  createDefaultAISettings,
  migrateAISettings,
  redactProvider,
  type AISettings,
  type ProviderConfig,
  type RedactedProvider,
} from "./config-schema";
import { AIError } from "./errors";
import {
  createFileSecretStore,
  providerSecretRef,
  type SecretStore,
} from "./secrets";

function defaultSettingsPath() {
  const dataDir =
    process.env.SCRAPEBOT_DATA_DIR ||
    path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
  return path.join(dataDir, "ai-settings.json");
}

export type AIConfigStore = {
  getSettings(): Promise<AISettings>;
  saveSettings(settings: AISettings): Promise<AISettings>;
  listProvidersRedacted(): Promise<RedactedProvider[]>;
  upsertProvider(
    provider: ProviderConfig,
    apiKey?: string | null
  ): Promise<AISettings>;
  removeProvider(providerId: string): Promise<AISettings>;
  setDefaultProvider(providerId: string): Promise<AISettings>;
  updateRouting(routing: AISettings["routing"]): Promise<AISettings>;
  getSecretStore(): SecretStore;
};

function resolveSettingsPath(): string {
  return process.env.WEBPILOT_AI_SETTINGS_PATH || defaultSettingsPath();
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function createAIConfigStore(options?: {
  settingsPath?: string;
  secretStore?: SecretStore;
}): AIConfigStore {
  const settingsPath = options?.settingsPath ?? resolveSettingsPath();
  const secretStore = options?.secretStore ?? createFileSecretStore();

  async function readRaw(): Promise<AISettings> {
    if (!fs.existsSync(settingsPath)) {
      const defaults = createDefaultAISettings();
      await writeRaw(defaults);
      return defaults;
    }

    try {
      const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      return migrateAISettings(raw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid AI settings file.";
      throw new AIError(message, { code: "CONFIG_INVALID", cause: error });
    }
  }

  async function writeRaw(settings: AISettings): Promise<AISettings> {
    const validated = migrateAISettings(settings);
    ensureParentDir(settingsPath);
    const tmp = `${settingsPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(validated, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.renameSync(tmp, settingsPath);
    try {
      fs.chmodSync(settingsPath, 0o600);
    } catch {
      // ignore
    }
    return validated;
  }

  return {
    getSecretStore() {
      return secretStore;
    },

    async getSettings() {
      return readRaw();
    },

    async saveSettings(settings) {
      return writeRaw(settings);
    },

    async listProvidersRedacted() {
      const settings = await readRaw();
      const result: RedactedProvider[] = [];
      for (const provider of settings.providers) {
        const hasSecret = provider.secretRef
          ? await secretStore.has(provider.secretRef)
          : false;
        result.push(redactProvider(provider, hasSecret));
      }
      return result;
    },

    async upsertProvider(provider, apiKey) {
      const settings = await readRaw();
      const nextProviders = [...settings.providers];
      const index = nextProviders.findIndex((p) => p.id === provider.id);

      let secretRef = provider.secretRef;
      if (apiKey !== undefined && apiKey !== null) {
        if (apiKey.trim() === "") {
          if (secretRef) {
            await secretStore.delete(secretRef);
          }
          secretRef = undefined;
        } else {
          secretRef = secretRef || providerSecretRef(provider.id);
          await secretStore.set(secretRef, apiKey.trim());
        }
      }

      const nextProvider: ProviderConfig = {
        ...provider,
        secretRef,
      };

      if (index >= 0) {
        nextProviders[index] = nextProvider;
      } else {
        nextProviders.push(nextProvider);
      }

      return writeRaw({
        ...settings,
        providers: nextProviders,
        defaultProviderId: settings.defaultProviderId || nextProvider.id,
      });
    },

    async removeProvider(providerId) {
      const settings = await readRaw();
      if (settings.providers.length <= 1) {
        throw new AIError("Cannot remove the last provider.", {
          code: "CONFIG_INVALID",
        });
      }

      const target = settings.providers.find((p) => p.id === providerId);
      if (!target) {
        throw new AIError(`Provider "${providerId}" not found.`, {
          code: "PROVIDER_NOT_FOUND",
          providerId,
        });
      }

      if (target.secretRef) {
        await secretStore.delete(target.secretRef);
      }

      const nextProviders = settings.providers.filter((p) => p.id !== providerId);
      const nextDefault =
        settings.defaultProviderId === providerId
          ? nextProviders[0].id
          : settings.defaultProviderId;

      const taskProviders = { ...settings.routing.taskProviders };
      if (taskProviders) {
        for (const [task, id] of Object.entries(taskProviders)) {
          if (id === providerId) {
            delete taskProviders[task as keyof typeof taskProviders];
          }
        }
      }

      return writeRaw({
        ...settings,
        defaultProviderId: nextDefault,
        providers: nextProviders,
        routing: {
          ...settings.routing,
          taskProviders,
          fallbackProviderIds: settings.routing.fallbackProviderIds.filter(
            (id) => id !== providerId
          ),
        },
      });
    },

    async setDefaultProvider(providerId) {
      const settings = await readRaw();
      if (!settings.providers.some((p) => p.id === providerId)) {
        throw new AIError(`Provider "${providerId}" not found.`, {
          code: "PROVIDER_NOT_FOUND",
          providerId,
        });
      }
      return writeRaw({ ...settings, defaultProviderId: providerId });
    },

    async updateRouting(routing) {
      const settings = await readRaw();
      return writeRaw({
        ...settings,
        routing: {
          ...settings.routing,
          ...routing,
        },
      });
    },
  };
}

let singleton: AIConfigStore | null = null;

export function getAIConfigStore(): AIConfigStore {
  if (!singleton) {
    singleton = createAIConfigStore();
  }
  return singleton;
}

/** Test helper */
export function resetAIConfigStoreForTests() {
  singleton = null;
}
