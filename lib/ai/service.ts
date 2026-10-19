import type { AIRequest, AIResponse, RouteResult } from "./types";
import type { AISettings, ProviderConfig, RedactedProvider } from "./config-schema";
import { ProviderConfigSchema } from "./config-schema";
import {
  createAIConfigStore,
  getAIConfigStore,
  type AIConfigStore,
} from "./config-store";
import {
  ProviderRegistry,
  createProviderFromFactory,
} from "./registry";
import { AIRouter } from "./router";
import { bootstrapAIProviders } from "./bootstrap";
import { resolveProviderSecret } from "./secrets";
import { AIError, sanitizeErrorMessage } from "./errors";
import { ConnectionTestSchema } from "./structured";
import { schemaForTask, assertActionsAllowed, WorkflowPlanSchema } from "./schemas/tasks";
import type { ZodType } from "zod";

const ENV_FALLBACKS: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  "openai-compatible": ["OPENAI_API_KEY", "COMPATIBLE_API_KEY"],
  custom: ["CUSTOM_AI_API_KEY"],
};

export type AIService = {
  getSettings(): Promise<AISettings>;
  listProviders(): Promise<RedactedProvider[]>;
  upsertProvider(
    input: unknown,
    apiKey?: string | null
  ): Promise<{ settings: AISettings; providers: RedactedProvider[] }>;
  removeProvider(
    providerId: string
  ): Promise<{ settings: AISettings; providers: RedactedProvider[] }>;
  setDefaultProvider(providerId: string): Promise<AISettings>;
  updateRouting(routing: AISettings["routing"]): Promise<AISettings>;
  checkProvider(providerId: string): Promise<{
    available: boolean;
    message?: string;
    capabilities?: Record<string, string>;
    models?: string[];
  }>;
  testProvider(
    providerId: string,
    prompt?: string
  ): Promise<AIResponse>;
  runTask(request: AIRequest): Promise<RouteResult>;
  reload(): Promise<void>;
};

async function buildProvider(
  config: ProviderConfig,
  store: AIConfigStore,
  timeoutMs: number
) {
  const apiKey = await resolveProviderSecret(
    store.getSecretStore(),
    config.secretRef,
    ENV_FALLBACKS[config.kind] ?? []
  );

  return createProviderFromFactory(config.kind, {
    id: config.id,
    name: config.name,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey,
    settings: config.settings,
    timeoutMs,
  });
}

export function createAIService(options?: {
  configStore?: AIConfigStore;
}): AIService {
  bootstrapAIProviders();

  const configStore = options?.configStore ?? getAIConfigStore();
  const registry = new ProviderRegistry();
  let router: AIRouter | null = null;

  async function ensureLoaded() {
    const settings = await configStore.getSettings();
    registry.clear();

    for (const provider of settings.providers) {
      if (!provider.enabled) continue;
      try {
        const instance = await buildProvider(
          provider,
          configStore,
          settings.defaultTimeoutMs
        );
        registry.set(instance);
      } catch (error) {
        // Keep going — unavailable adapters surface on check/test
        console.warn(
          `[ai] Failed to load provider ${provider.id}:`,
          error instanceof Error ? sanitizeErrorMessage(error.message) : error
        );
      }
    }

    router = new AIRouter({ settings, registry });
    return settings;
  }

  async function getRouter() {
    if (!router) await ensureLoaded();
    return router!;
  }

  return {
    async reload() {
      await ensureLoaded();
    },

    async getSettings() {
      return configStore.getSettings();
    },

    async listProviders() {
      return configStore.listProvidersRedacted();
    },

    async upsertProvider(input, apiKey) {
      const parsed = ProviderConfigSchema.parse(input);
      await configStore.upsertProvider(parsed, apiKey);
      await ensureLoaded();
      return {
        settings: await configStore.getSettings(),
        providers: await configStore.listProvidersRedacted(),
      };
    },

    async removeProvider(providerId) {
      await configStore.removeProvider(providerId);
      await ensureLoaded();
      return {
        settings: await configStore.getSettings(),
        providers: await configStore.listProvidersRedacted(),
      };
    },

    async setDefaultProvider(providerId) {
      const settings = await configStore.setDefaultProvider(providerId);
      await ensureLoaded();
      return settings;
    },

    async updateRouting(routing) {
      const settings = await configStore.updateRouting(routing);
      await ensureLoaded();
      return settings;
    },

    async checkProvider(providerId) {
      await ensureLoaded();
      const provider = registry.get(providerId);
      if (!provider) {
        // Try to surface config-level presence
        const settings = await configStore.getSettings();
        const cfg = settings.providers.find((p) => p.id === providerId);
        if (!cfg) {
          throw new AIError(`Provider "${providerId}" not found.`, {
            code: "PROVIDER_NOT_FOUND",
            providerId,
          });
        }
        return {
          available: false,
          message: cfg.enabled
            ? "Provider failed to initialize. Check configuration and secrets."
            : "Provider is disabled.",
        };
      }

      const result = await provider.checkAvailability();
      return {
        available: result.available,
        message: result.message,
        capabilities: result.capabilities as Record<string, string> | undefined,
        models: result.models,
      };
    },

    async testProvider(providerId, prompt) {
      await ensureLoaded();
      const provider = registry.get(providerId);
      if (!provider) {
        throw new AIError(`Provider "${providerId}" is not loaded.`, {
          code: "PROVIDER_NOT_FOUND",
          providerId,
        });
      }

      // CLI cannot do structured connection-test JSON — use plain text.
      if (provider.kind === "cli") {
        return provider.generate({
          task: "interpret",
          system: "You are running a short connection test. Reply briefly.",
          input: prompt || "connection-test: reply with a short hello",
        });
      }

      return provider.generate({
        task: "interpret",
        system:
          "You are running a short connection test. Return JSON only matching { ok: boolean, message: string }.",
        input: {
          kind: "connection-test",
          prompt: prompt || "Reply confirming you are ready.",
        },
        outputSchema: ConnectionTestSchema,
      });
    },

    async runTask(request) {
      const r = await getRouter();

      // Attach domain schema when caller omitted outputSchema.
      // Pass outputSchema: null for plain-text generation.
      let outputSchema: unknown | undefined;
      if (request.outputSchema === null) {
        outputSchema = undefined;
      } else if (request.outputSchema === undefined) {
        outputSchema = schemaForTask(request.task) as ZodType | undefined;
      } else {
        outputSchema = request.outputSchema;
      }

      const result = await r.route({
        ...request,
        outputSchema,
      });

      // Extra safety: validate plans never include prohibited actions
      if (request.task === "plan" && result.response.data) {
        const plan = WorkflowPlanSchema.parse(result.response.data);
        assertActionsAllowed(plan.actions);
      }

      return result;
    },
  };
}

let singleton: AIService | null = null;

export function getAIService(): AIService {
  if (!singleton) {
    singleton = createAIService();
  }
  return singleton;
}

export function resetAIServiceForTests() {
  singleton = null;
}

export { createAIConfigStore };
