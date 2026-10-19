/**
 * Provider-agnostic AI types for WebPilot / Scrapebot.
 * Vendor SDKs must not leak beyond provider adapters.
 */

export const AI_TASKS = [
  "classify",
  "intent",
  "plan",
  "interpret",
  "recover",
] as const;

export type AITask = (typeof AI_TASKS)[number];

export const PROVIDER_KINDS = [
  "mock",
  "openai-compatible",
  "ollama",
  "openai",
  "anthropic",
  "google",
  "custom",
  "cli",
] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export type CapabilityName =
  | "textGeneration"
  | "structuredJson"
  | "streaming"
  | "vision"
  | "toolCalling"
  | "embeddings"
  | "cancellation"
  | "localExecution";

export type CapabilityStatus = "supported" | "unsupported" | "unknown" | "verified";

export type CapabilityMap = Partial<Record<CapabilityName, CapabilityStatus>>;

export type AvailabilityResult = {
  available: boolean;
  message?: string;
  capabilities?: CapabilityMap;
  models?: string[];
};

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AIRequest = {
  task: AITask;
  system: string;
  input: unknown;
  /**
   * Zod schema for structured output validation.
   * - omit / undefined: auto-select domain schema for the task (API default)
   * - null: plain text (no structured validation)
   * - Zod schema: validate against the provided schema
   */
  outputSchema?: unknown | null;
  model?: string;
  signal?: AbortSignal;
  /** Soft timeout in ms; providers should honor when possible */
  timeoutMs?: number;
  /** Max repair retries when structured output fails validation */
  maxRepairAttempts?: number;
};

export type AIResponse = {
  text: string;
  /** Parsed + Zod-validated structured output when schema was provided */
  data?: unknown;
  providerId: string;
  model?: string;
  durationMs: number;
  usage?: TokenUsage;
  /** True when a repair/retry cycle was used */
  repaired?: boolean;
};

export type AIProvider = {
  id: string;
  kind: ProviderKind;
  name: string;
  /** Declared general capabilities for this provider kind (not verified) */
  capabilities: CapabilityMap;
  /** Remote providers that may receive prompt content off-machine */
  isCloud: boolean;

  checkAvailability(): Promise<AvailabilityResult>;
  generate(request: AIRequest): Promise<AIResponse>;
};

export type ProviderFactoryContext = {
  id: string;
  name: string;
  model?: string;
  baseUrl?: string;
  /** Resolved secret value (API key); never logged */
  apiKey?: string;
  settings?: Record<string, unknown>;
  timeoutMs?: number;
};

export type ProviderFactory = (
  ctx: ProviderFactoryContext
) => Promise<AIProvider> | AIProvider;

export type RoutingMode = "selected" | "per-task" | "fallback";

export type RouteResult = {
  response: AIResponse;
  attemptedProviderIds: string[];
  usedFallback: boolean;
};
