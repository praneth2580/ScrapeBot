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

type ChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string; type?: string };
};

function stringifyInput(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input, null, 2);
}

export type OpenAICompatibleOptions = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  allowPrivateEndpoints?: boolean;
  isCloud?: boolean;
  /** Extra headers */
  headers?: Record<string, string>;
  kind?: "openai-compatible" | "openai" | "custom" | "ollama";
};

export function createOpenAICompatibleProvider(
  options: OpenAICompatibleOptions
): AIProvider {
  const kind = options.kind ?? "openai-compatible";
  const capabilities = defaultCapabilitiesForKind(
    kind === "ollama" ? "ollama" : kind === "openai" ? "openai" : "openai-compatible"
  );
  const allowPrivate =
    options.allowPrivateEndpoints ??
    (kind === "ollama" || !options.isCloud);

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  assertSafeEndpoint(baseUrl, { allowPrivateEndpoints: allowPrivate });

  async function chatCompletions(
    system: string,
    user: string,
    request: AIRequest,
    preferJson: boolean
  ): Promise<{ text: string; model?: string; usage?: AIResponse["usage"] }> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? options.timeoutMs ?? 120_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      };
      if (options.apiKey) {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }

      const body: Record<string, unknown> = {
        model: request.model || options.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
      };

      if (preferJson) {
        // Many OpenAI-compatible servers accept response_format; ignore if rejected.
        body.response_format = { type: "json_object" };
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });

      const payload = (await response.json()) as ChatCompletionResponse;

      if (!response.ok) {
        const message =
          payload.error?.message ||
          `Provider returned HTTP ${response.status}`;
        throw new AIError(message, {
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
        });
      }

      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new AIError("Provider returned an empty response.", {
          code: "INVALID_RESPONSE",
          providerId: options.id,
        });
      }

      return {
        text,
        model: payload.model,
        usage: {
          inputTokens: payload.usage?.prompt_tokens,
          outputTokens: payload.usage?.completion_tokens,
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
    kind: kind === "ollama" ? "ollama" : kind === "openai" ? "openai" : kind === "custom" ? "custom" : "openai-compatible",
    name: options.name,
    capabilities,
    isCloud: options.isCloud ?? false,

    async checkAvailability(): Promise<AvailabilityResult> {
      try {
        assertSafeEndpoint(baseUrl, { allowPrivateEndpoints: allowPrivate });

        const headers: Record<string, string> = {
          Accept: "application/json",
          ...options.headers,
        };
        if (options.apiKey) {
          headers.Authorization = `Bearer ${options.apiKey}`;
        }

        const response = await fetch(`${baseUrl}/models`, {
          headers,
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
          cache: "no-store",
        });

        if (response.status === 401 || response.status === 403) {
          return {
            available: false,
            message: "Authentication failed when listing models.",
          };
        }

        if (!response.ok) {
          // Some servers don't expose /models — still try a lightweight health assumption
          return {
            available: response.status !== 404,
            message: `Models endpoint returned HTTP ${response.status}. Endpoint may still accept chat completions.`,
            capabilities,
          };
        }

        const payload = (await response.json()) as {
          data?: Array<{ id?: string }>;
        };
        const models =
          payload.data?.map((m) => m.id).filter((id): id is string => !!id) ??
          [];

        return {
          available: true,
          message: `Connected. ${models.length} model(s) listed.`,
          models,
          capabilities: {
            ...capabilities,
            textGeneration: "verified",
            cancellation: "verified",
          },
        };
      } catch (error) {
        const aiError = toAIError(error, options.id);
        return { available: false, message: aiError.message };
      }
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
        const preferJson = Boolean(request.outputSchema) && attempt === 0;
        let result;
        try {
          result = await chatCompletions(system, user, request, preferJson);
        } catch (error) {
          // Retry without response_format if server rejects it
          if (
            preferJson &&
            error instanceof AIError &&
            /response_format|json_object/i.test(error.message)
          ) {
            result = await chatCompletions(system, user, request, false);
          } else {
            throw error;
          }
        }

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

export function openAICompatibleFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  if (!ctx.baseUrl) {
    throw new AIError("baseUrl is required for openai-compatible providers.", {
      code: "CONFIG_INVALID",
    });
  }
  if (!ctx.model) {
    throw new AIError("model is required for openai-compatible providers.", {
      code: "CONFIG_INVALID",
    });
  }

  const settings = ctx.settings ?? {};
  return createOpenAICompatibleProvider({
    id: ctx.id,
    name: ctx.name,
    baseUrl: ctx.baseUrl,
    model: ctx.model,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    allowPrivateEndpoints: Boolean(settings.allowPrivateEndpoints ?? true),
    isCloud: Boolean(settings.isCloud ?? false),
    headers:
      typeof settings.headers === "object" && settings.headers
        ? (settings.headers as Record<string, string>)
        : undefined,
  });
}
