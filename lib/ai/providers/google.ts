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

const DEFAULT_GOOGLE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

function stringifyInput(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input, null, 2);
}

/**
 * Google Gemini generateContent API via documented REST (no mandatory SDK).
 */
export function createGoogleProvider(options: {
  id: string;
  name: string;
  baseUrl?: string;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}): AIProvider {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl || DEFAULT_GOOGLE_URL
  );
  assertSafeEndpoint(baseUrl, { allowPrivateEndpoints: false });
  const capabilities = defaultCapabilitiesForKind("google");

  async function generateContent(
    system: string,
    user: string,
    request: AIRequest
  ): Promise<{ text: string; model?: string; usage?: AIResponse["usage"] }> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? options.timeoutMs ?? 120_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });

    const model = request.model || options.model;
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: request.outputSchema
            ? { responseMimeType: "application/json" }
            : undefined,
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
        error?: { message?: string; status?: string };
      };

      if (!response.ok) {
        throw new AIError(
          payload.error?.message || `Google HTTP ${response.status}`,
          {
            code:
              response.status === 401 || response.status === 403
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

      const text = payload.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("")
        .trim();

      if (!text) {
        throw new AIError("Google returned an empty response.", {
          code: "INVALID_RESPONSE",
          providerId: options.id,
        });
      }

      return {
        text,
        model,
        usage: {
          inputTokens: payload.usageMetadata?.promptTokenCount,
          outputTokens: payload.usageMetadata?.candidatesTokenCount,
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
    kind: "google",
    name: options.name,
    capabilities,
    isCloud: true,

    async checkAvailability(): Promise<AvailabilityResult> {
      try {
        const url = `${baseUrl}/models?key=${encodeURIComponent(options.apiKey)}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
          cache: "no-store",
        });
        if (!response.ok) {
          return {
            available: false,
            message: `Google models list failed (HTTP ${response.status}).`,
          };
        }
        const payload = (await response.json()) as {
          models?: Array<{ name?: string }>;
        };
        const models =
          payload.models
            ?.map((m) => m.name?.replace(/^models\//, ""))
            .filter((n): n is string => !!n) ?? [];

        return {
          available: true,
          message: `Google Gemini ready. ${models.length} model(s) listed.`,
          models,
          capabilities: {
            ...capabilities,
            textGeneration: "verified",
            cancellation: "verified",
          },
        };
      } catch (error) {
        return {
          available: false,
          message: toAIError(error, options.id).message,
        };
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
        const result = await generateContent(system, user, request);
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

export function googleProviderFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  if (!ctx.model) {
    throw new AIError("model is required for Google providers.", {
      code: "CONFIG_INVALID",
    });
  }
  if (!ctx.apiKey) {
    throw new AIError(
      "API key is required for Google. Configure a secret or set GOOGLE_API_KEY / GEMINI_API_KEY.",
      { code: "SECRET_MISSING" }
    );
  }

  return createGoogleProvider({
    id: ctx.id,
    name: ctx.name,
    baseUrl: ctx.baseUrl,
    model: ctx.model,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
  });
}
