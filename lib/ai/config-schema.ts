import { z } from "zod";
import { AI_TASKS, PROVIDER_KINDS } from "./types";

export const AITaskSchema = z.enum(AI_TASKS);
export const ProviderKindSchema = z.enum(PROVIDER_KINDS);
export const RoutingModeSchema = z.enum(["selected", "per-task", "fallback"]);

export const ProviderConfigSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(120),
  kind: ProviderKindSchema,
  enabled: z.boolean().default(true),
  model: z.string().min(1).max(200).optional(),
  baseUrl: z.string().url().optional(),
  /** Reference into secret store — never the raw key */
  secretRef: z.string().min(1).max(128).optional(),
  /** Non-secret provider settings (temperature, allowLocalEndpoints, etc.) */
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const RoutingConfigSchema = z.object({
  mode: RoutingModeSchema.default("selected"),
  taskProviders: z
    .partialRecord(AITaskSchema, z.string().min(1))
    .optional(),
  fallbackProviderIds: z.array(z.string().min(1)).default([]),
  /** When false, cloud providers are never used as fallback */
  allowCloudFallback: z.boolean().default(false),
});

export const AISettingsSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  defaultProviderId: z.string().min(1),
  routing: RoutingConfigSchema,
  providers: z.array(ProviderConfigSchema).min(1),
  /** Structured-output repair attempts after validation failure */
  maxRepairAttempts: z.number().int().min(0).max(3).default(1),
  /** Default request timeout */
  defaultTimeoutMs: z.number().int().min(1_000).max(900_000).default(120_000),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;
export type AISettings = z.infer<typeof AISettingsSchemaV1>;

export const CURRENT_SCHEMA_VERSION = 1 as const;

export function createDefaultAISettings(): AISettings {
  return {
    schemaVersion: 1,
    defaultProviderId: "mock-local",
    routing: {
      mode: "selected",
      fallbackProviderIds: [],
      allowCloudFallback: false,
    },
    providers: [
      {
        id: "mock-local",
        name: "Mock Provider",
        kind: "mock",
        enabled: true,
        model: "mock-v1",
        settings: {},
      },
    ],
    maxRepairAttempts: 1,
    defaultTimeoutMs: 120_000,
  };
}

/**
 * Migrate / normalize raw config. Rejects unknown schema versions.
 */
export function migrateAISettings(raw: unknown): AISettings {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    throw new Error("AI settings must be an object.");
  }

  const record = raw as Record<string, unknown>;
  const version = record.schemaVersion;

  if (version === undefined) {
    // Treat unversioned blobs as v1 candidates after injecting defaults
    const candidate = {
      ...createDefaultAISettings(),
      ...record,
      schemaVersion: 1 as const,
    };
    return AISettingsSchemaV1.parse(candidate);
  }

  if (version !== 1) {
    throw new Error(
      `Unsupported AI settings schemaVersion ${String(version)}. Expected ${CURRENT_SCHEMA_VERSION}.`
    );
  }

  const parsed = AISettingsSchemaV1.parse(raw);

  const ids = new Set(parsed.providers.map((p) => p.id));
  if (!ids.has(parsed.defaultProviderId)) {
    throw new Error(
      `defaultProviderId "${parsed.defaultProviderId}" is not in providers.`
    );
  }

  for (const fallbackId of parsed.routing.fallbackProviderIds) {
    if (!ids.has(fallbackId)) {
      throw new Error(`fallbackProviderId "${fallbackId}" is not in providers.`);
    }
  }

  if (parsed.routing.taskProviders) {
    for (const [task, providerId] of Object.entries(parsed.routing.taskProviders)) {
      if (providerId && !ids.has(providerId)) {
        throw new Error(
          `taskProviders.${task} references unknown provider "${providerId}".`
        );
      }
    }
  }

  return parsed;
}

/** Public view — never includes secret values */
export const RedactedProviderSchema = ProviderConfigSchema.extend({
  hasSecret: z.boolean(),
});

export type RedactedProvider = z.infer<typeof RedactedProviderSchema>;

export function redactProvider(
  provider: ProviderConfig,
  hasSecret: boolean
): RedactedProvider {
  return {
    ...provider,
    hasSecret,
  };
}
