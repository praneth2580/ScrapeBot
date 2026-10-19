import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMockProvider } from "../providers/mock";
import { AIError } from "../errors";
import { createFileSecretStore } from "../secrets";
import { createAIConfigStore } from "../config-store";
import { assertSafeEndpoint } from "../endpoint-guard";
import { runCli, CLI_EXECUTABLE_ALLOWLIST } from "../providers/cli/base";
import { createCursorCliProvider } from "../providers/cli/cursor";
import { createAIService } from "../service";
import { classifyComponentDeterministic } from "../hybrid/classify";

describe("cancellation, secrets, CLI, endpoint guard", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "webpilot-ai-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cancels a delayed mock provider", async () => {
    const provider = createMockProvider({
      id: "slow",
      delayMs: 5_000,
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    await assert.rejects(
      () =>
        provider.generate({
          task: "interpret",
          system: "x",
          input: "y",
          signal: controller.signal,
          outputSchema: null,
        }),
      (err: unknown) => err instanceof AIError && err.code === "CANCELLED"
    );
  });

  it("stores and retrieves secrets without exposing them in settings", async () => {
    const secretsDir = path.join(tmpDir, "secrets");
    const settingsPath = path.join(tmpDir, "ai-settings.json");
    const store = createFileSecretStore(secretsDir);
    const config = createAIConfigStore({ settingsPath, secretStore: store });

    await config.upsertProvider(
      {
        id: "openai-1",
        name: "OpenAI",
        kind: "openai",
        enabled: true,
        model: "gpt-4o-mini",
      },
      "sk-test-secret-value"
    );

    const settingsRaw = fs.readFileSync(settingsPath, "utf8");
    assert.equal(settingsRaw.includes("sk-test-secret-value"), false);

    const providers = await config.listProvidersRedacted();
    const openai = providers.find((p) => p.id === "openai-1");
    assert.ok(openai);
    assert.equal(openai.hasSecret, true);
    assert.equal("apiKey" in (openai as object), false);

    const secret = await store.get(openai.secretRef!);
    assert.equal(secret, "sk-test-secret-value");
  });

  it("blocks cloud metadata and private endpoints by default", () => {
    assert.throws(
      () => assertSafeEndpoint("http://169.254.169.254/latest/meta-data/"),
      (err: unknown) =>
        err instanceof AIError && err.code === "ENDPOINT_BLOCKED"
    );
    assert.throws(
      () => assertSafeEndpoint("http://127.0.0.1:11434"),
      (err: unknown) =>
        err instanceof AIError && err.code === "ENDPOINT_BLOCKED"
    );
    assert.doesNotThrow(() =>
      assertSafeEndpoint("http://127.0.0.1:11434", {
        allowPrivateEndpoints: true,
      })
    );
  });

  it("rejects non-allowlisted CLI executables", () => {
    assert.throws(
      () =>
        runCli({
          executable: "bash",
          args: ["-c", "echo hi"],
        }),
      /allowlist/
    );
    assert.equal(CLI_EXECUTABLE_ALLOWLIST.has("agent"), true);
  });

  it("marks Cursor CLI structured output as unsupported", async () => {
    const provider = createCursorCliProvider({
      id: "cursor-cli",
      name: "Cursor",
      executable: "agent",
    });

    await assert.rejects(
      () =>
        provider.generate({
          task: "plan",
          system: "x",
          input: {},
          outputSchema: { type: "object" },
        }),
      (err: unknown) =>
        err instanceof AIError && err.code === "CAPABILITY_UNSUPPORTED"
    );
  });

  it("runs end-to-end mock provider via AIService", async () => {
    const settingsPath = path.join(tmpDir, "svc-settings.json");
    const secretsDir = path.join(tmpDir, "svc-secrets");
    const configStore = createAIConfigStore({
      settingsPath,
      secretStore: createFileSecretStore(secretsDir),
    });
    const service = createAIService({ configStore });

    const check = await service.checkProvider("mock-local");
    assert.equal(check.available, true);

    const test = await service.testProvider("mock-local");
    assert.equal(test.providerId, "mock-local");
    assert.ok(test.data);

    const routed = await service.runTask({
      task: "intent",
      system: "Parse intent",
      input: { message: "go home" },
    });
    assert.equal(routed.response.providerId, "mock-local");
    assert.ok(routed.response.data);
  });

  it("classifies native DOM controls without AI", () => {
    const button = classifyComponentDeterministic({
      tagName: "button",
      type: "submit",
      name: "Save",
    });
    assert.equal(button?.role, "button");
    assert.equal(button?.confidence && button.confidence >= 0.9, true);

    const custom = classifyComponentDeterministic({
      tagName: "div",
      role: "presentation",
      ambiguous: true,
    });
    assert.equal(custom, null);
  });
});
