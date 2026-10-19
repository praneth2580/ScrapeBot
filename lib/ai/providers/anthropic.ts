import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AvailabilityResult,
  ProviderFactoryContext,
} from "../types";
import { defaultCapabilitiesForKind } from "../registry";
import { AIError, toAIError } from "../errors";
import {
  assertSafeEndpoint,
  normalizeBaseUrl,
} from "../endpoint-guard";
import {
  buildRepairPrompt,
  validateStructuredOutput,
} from "../structured";

const DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

function stringifyInput(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input, null, 2);
}

/**
 * Anthropic Messages API via documented HTTP endpoints (no mandatory SDK).
 */
export function createAnthropicProvider(options: {
  id: string;
  name: string;
  baseUrl?: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}): AIProvider {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_ANTHROPIC_URL);
  assertSafeEndpoint(baseUrl, { allowPrivateEndpoints: false });
  const capabilities = defaultCapabilitiesForKind("anthropic");

  async function messages(
    system: string,
    user: string,
    request: AIRequest
  ): Promise<{ text: string; model?: string; usage?: AIResponse["usage"] }> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? options.timeoutMs ?? 120_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: request.model || options.model,
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        model?: string;
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        error?: { message?: string; type?: string };
      };

      if (!response.ok) {
        throw new AIError(
          payload.error?.message || `Anthropic HTTP ${response.status}`,
          {
            code:
              response.status === 401
                ? "AUTH_FAILED"
                : response.status === 404
                  ? "MODEL_NOT_FOUND"
                  : response.status === 429
                    ? "RATE_LIMITED"
                    : "PROVIDER_UNAVAILABLE",
            providerId: options.id,
            retryable: response.status === 429 || response.status >= 500,
          }
        );
      }

      const text = payload.content
        ?.filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!text) {
        throw new AIError("Anthropic returned an empty response.", {
          code: "INVALID_RESPONSE",
          providerId: options.id,
        });
      }

      return {
        text,
        model: payload.model,
        usage: {
          inputTokens: payload.usage?.input_tokens,
          outputTokens: payload.usage?.output_tokens,
        },
      };
    } catch (error) {
      throw toAIError(error, options.id);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    id: options.id,
    kind: "anthropic",
    name: options.name,
    capabilities,
    isCloud: true,

    async checkAvailability(): Promise<AvailabilityResult> {
      // Anthropic has no public list-models without auth nuances; probe with a tiny request is costly.
      // We verify credentials are present and endpoint is reachable via a models-less auth check:
      // HEAD/GET is not universally supported — report configured readiness.
      if (!options.apiKey) {
        return { available: false, message: "API key missing." };
      }
      return {
        available: true,
        message:
          "Anthropic credentials configured. Run a test prompt to verify live access.",
        capabilities,
        models: [options.model],
      };
    },

    async generate(request: AIRequest): Promise<AIResponse> {
      const started = Date.now();
      const maxRepair = request.maxRepairAttempts ?? 1;
      let system = request.system;
      let user = stringifyInput(request.input);
      let repaired = false;

      if (request.outputSchema) {
        system = `${system}\n\nRespond with a single JSON object only.`;
      }

      for (let attempt = 0; attempt <= maxRepair; attempt++) {
        const result = await messages(system, user, request);
        try {
          const validated = validateStructuredOutput(
            result.text,
            request.outputSchema
          );
          return {
            text: validated.text,
            data: validated.data,
            providerId: options.id,
            model: result.model || request.model || options.model,
            durationMs: Date.now() - started,
            usage: result.usage,
            repaired,
          };
        } catch (error) {
          if (
            attempt >= maxRepair ||
            !(error instanceof AIError) ||
            error.code !== "VALIDATION_FAILED"
          ) {
            throw error;
          }
          repaired = true;
          const repair = buildRepairPrompt(
            request.system,
            request.input,
            result.text,
            error.message
          );
          system = repair.system;
          user = stringifyInput(repair.input);
        }
      }

      throw new AIError("Exhausted structured-output repair attempts.", {
        code: "VALIDATION_FAILED",
        providerId: options.id,
      });
    },
  };
}

export function anthropicProviderFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  if (!ctx.model) {
    throw new AIError("model is required for Anthropic providers.", {
      code: "CONFIG_INVALID",
    });
  }
  if (!ctx.apiKey) {
    throw new AIError(
      "API key is required for Anthropic. Configure a secret or set ANTHROPIC_API_KEY.",
      { code: "SECRET_MISSING" }
    );
  }

  return createAnthropicProvider({
    id: ctx.id,
    name: ctx.name,
    baseUrl: ctx.baseUrl,
    model: ctx.model,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
  });
}
