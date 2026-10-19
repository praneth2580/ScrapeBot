import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../registry";
import { AIRouter } from "../router";
import { createMockProvider } from "../providers/mock";
import { createDefaultAISettings } from "../config-schema";
import { AIError } from "../errors";
import { ConnectionTestSchema } from "../structured";
import { bootstrapAIProviders } from "../bootstrap";

describe("registry and router", () => {
  beforeEach(() => {
    bootstrapAIProviders();
  });

  it("selects the default provider in selected mode", async () => {
    const registry = new ProviderRegistry();
    const mock = createMockProvider({ id: "mock-local" });
    registry.set(mock);

    const settings = createDefaultAISettings();
    const router = new AIRouter({ settings, registry });

    const result = await router.route({
      task: "interpret",
      system: "connection test",
      input: { kind: "connection-test" },
      outputSchema: ConnectionTestSchema,
    });

    assert.equal(result.response.providerId, "mock-local");
    assert.equal(result.usedFallback, false);
    assert.deepEqual(result.response.data, {
      ok: true,
      message: "Mock provider is ready.",
    });
  });

  it("falls back when primary fails and mode is fallback", async () => {
    const registry = new ProviderRegistry();
    registry.set(
      createMockProvider({
        id: "primary",
        failWith: new AIError("boom", { code: "PROVIDER_UNAVAILABLE" }),
      })
    );
    registry.set(createMockProvider({ id: "secondary" }));

    const settings = createDefaultAISettings();
    settings.defaultProviderId = "primary";
    settings.providers = [
      { id: "primary", name: "P", kind: "mock", enabled: true },
      { id: "secondary", name: "S", kind: "mock", enabled: true },
    ];
    settings.routing = {
      mode: "fallback",
      fallbackProviderIds: ["secondary"],
      allowCloudFallback: false,
    };

    const router = new AIRouter({ settings, registry });
    const result = await router.route({
      task: "interpret",
      system: "connection test",
      input: { kind: "connection-test" },
      outputSchema: ConnectionTestSchema,
    });

    assert.equal(result.response.providerId, "secondary");
    assert.equal(result.usedFallback, true);
  });

  it("refuses cloud fallback when allowCloudFallback is false", async () => {
    const registry = new ProviderRegistry();
    registry.set(
      createMockProvider({
        id: "primary",
        failWith: new AIError("boom", { code: "PROVIDER_UNAVAILABLE" }),
      })
    );
    const cloud = createMockProvider({ id: "cloud" });
    // Force cloud flag
    (cloud as { isCloud: boolean }).isCloud = true;
    registry.set(cloud);

    const settings = createDefaultAISettings();
    settings.defaultProviderId = "primary";
    settings.providers = [
      { id: "primary", name: "P", kind: "mock", enabled: true },
      { id: "cloud", name: "C", kind: "openai", enabled: true },
    ];
    settings.routing = {
      mode: "fallback",
      fallbackProviderIds: ["cloud"],
      allowCloudFallback: false,
    };

    const router = new AIRouter({ settings, registry });
    await assert.rejects(
      () =>
        router.route({
          task: "intent",
          system: "x",
          input: {},
        }),
      (err: unknown) =>
        err instanceof AIError && err.code === "FALLBACK_REFUSED"
    );
  });

  it("uses per-task provider mapping", async () => {
    const registry = new ProviderRegistry();
    registry.set(createMockProvider({ id: "default" }));
    registry.set(createMockProvider({ id: "planner" }));

    const settings = createDefaultAISettings();
    settings.defaultProviderId = "default";
    settings.providers = [
      { id: "default", name: "D", kind: "mock", enabled: true },
      { id: "planner", name: "P", kind: "mock", enabled: true },
    ];
    settings.routing = {
      mode: "per-task",
      taskProviders: { plan: "planner" },
      fallbackProviderIds: [],
      allowCloudFallback: false,
    };

    const router = new AIRouter({ settings, registry });
    const ids = router.resolveCandidateIds("plan");
    assert.deepEqual(ids, ["planner"]);
  });
});
