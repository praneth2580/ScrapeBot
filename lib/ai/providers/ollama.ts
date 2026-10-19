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

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
/** Match the chat prompt budget so small local models keep the instruction in window. */
const LOCAL_NUM_CTX = 4096;

function stringifyInput(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input, null, 2);
}

/**
 * Native Ollama HTTP adapter (/api/chat).
 * Does not depend on the existing app/lib/ollama.ts connector so the AI
 * package stays self-contained; chat-store can migrate later.
 */
export function createOllamaProvider(options: {
  id: string;
  name: string;
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}): AIProvider {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_OLLAMA_URL);
  assertSafeEndpoint(baseUrl, { allowPrivateEndpoints: true });
  const capabilities = defaultCapabilitiesForKind("ollama");

  async function chat(
    system: string,
    user: string,
    request: AIRequest,
    formatJson: boolean
  ): Promise<{ text: string; model?: string; usage?: AIResponse["usage"] }> {
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? options.timeoutMs ?? 300_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: request.model || options.model,
          stream: false,
          format: formatJson ? "json" : undefined,
          options: { num_ctx: LOCAL_NUM_CTX },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        model?: string;
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new AIError(payload.error || `Ollama HTTP ${response.status}`, {
          code:
            response.status === 404 ? "MODEL_NOT_FOUND" : "PROVIDER_UNAVAILABLE",
          providerId: options.id,
        });
      }

      const text = payload.message?.content?.trim();
      if (!text) {
        throw new AIError("Ollama returned an empty response.", {
          code: "INVALID_RESPONSE",
          providerId: options.id,
        });
      }

      return {
        text,
        model: payload.model,
        usage: {
          inputTokens: payload.prompt_eval_count,
          outputTokens: payload.eval_count,
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
    kind: "ollama",
    name: options.name,
    capabilities,
    isCloud: false,

    async checkAvailability(): Promise<AvailabilityResult> {
      try {
        const versionRes = await fetch(`${baseUrl}/api/version`, {
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        });
        if (!versionRes.ok) {
          return {
            available: false,
            message: `Ollama version check failed (HTTP ${versionRes.status}).`,
          };
        }

        const tagsRes = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(10_000),
          cache: "no-store",
        });
        const tags = (await tagsRes.json()) as {
          models?: Array<{ name?: string }>;
        };
        const models =
          tags.models?.map((m) => m.name).filter((n): n is string => !!n) ??
          [];

        return {
          available: true,
          message:
            models.length === 0
              ? "Ollama is running but no models are installed."
              : `Ollama ready with ${models.length} model(s).`,
          models,
          capabilities: {
            ...capabilities,
            textGeneration: "verified",
            structuredJson: "verified",
            cancellation: "verified",
            localExecution: "verified",
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
        const result = await chat(
          system,
          user,
          request,
          Boolean(request.outputSchema)
        );

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

export function ollamaProviderFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  const model =
    ctx.model ||
    process.env.OLLAMA_MODEL ||
    "llama3.2";

  return createOllamaProvider({
    id: ctx.id,
    name: ctx.name,
    baseUrl: ctx.baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL,
    model,
    timeoutMs: ctx.timeoutMs,
  });
}
