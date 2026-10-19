import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AvailabilityResult,
  ProviderFactoryContext,
} from "../types";
import { defaultCapabilitiesForKind } from "../registry";
import { AIError } from "../errors";
import {
  buildRepairPrompt,
  validateStructuredOutput,
} from "../structured";

export type MockProviderOptions = {
  id: string;
  name?: string;
  model?: string;
  /** Deterministic responses keyed by task */
  responses?: Partial<Record<string, string>>;
  /** Force generate() to throw */
  failWith?: Error | AIError;
  /** Artificial delay */
  delayMs?: number;
  /** Simulate unavailable */
  available?: boolean;
};

function defaultMockText(request: AIRequest): string {
  if (request.outputSchema) {
    // Produce plausible structured payloads per task
    switch (request.task) {
      case "classify":
        return JSON.stringify({
          role: "button",
          purpose: "submit",
          confidence: 0.9,
          rationale: "mock classification",
        });
      case "intent":
        return JSON.stringify({
          goal: "navigate",
          target: "home",
          confidence: 0.85,
          slots: {},
        });
      case "plan":
        return JSON.stringify({
          goal: "mock plan",
          actions: [
            {
              type: "click",
              locator: { strategy: "role", value: "button", name: "Submit" },
              requiresConfirmation: false,
            },
          ],
          postconditions: [{ type: "urlIncludes", value: "/" }],
        });
      case "interpret":
        return JSON.stringify({
          summary: "Mock page interpretation",
          fields: [],
        });
      case "recover":
        return JSON.stringify({
          reason: "page changed",
          revisedActions: [],
          abort: false,
        });
      default:
        return JSON.stringify({ ok: true, message: "mock ok" });
    }
  }

  return `Mock response for task=${request.task}`;
}

export function createMockProvider(
  options: MockProviderOptions
): AIProvider {
  const capabilities = defaultCapabilitiesForKind("mock");
  const model = options.model ?? "mock-v1";

  async function generateOnce(
    request: AIRequest,
    system: string,
    input: unknown
  ): Promise<string> {
    if (options.failWith) {
      throw options.failWith;
    }

    if (request.signal?.aborted) {
      throw new AIError("Provider request was cancelled.", {
        code: "CANCELLED",
        providerId: options.id,
      });
    }

    if (options.delayMs && options.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, options.delayMs);
        const onAbort = () => {
          clearTimeout(timer);
          reject(
            new AIError("Provider request was cancelled.", {
              code: "CANCELLED",
              providerId: options.id,
            })
          );
        };
        if (request.signal) {
          if (request.signal.aborted) {
            onAbort();
            return;
          }
          request.signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }

    const keyed = options.responses?.[request.task];
    if (keyed) return keyed;

    // Connection test heuristic
    const inputStr = JSON.stringify(input);
    if (inputStr.includes("connection-test") || system.includes("connection test")) {
      return JSON.stringify({ ok: true, message: "Mock provider is ready." });
    }

    return defaultMockText({ ...request, system, input });
  }

  return {
    id: options.id,
    kind: "mock",
    name: options.name ?? "Mock Provider",
    capabilities,
    isCloud: false,

    async checkAvailability(): Promise<AvailabilityResult> {
      if (options.available === false) {
        return { available: false, message: "Mock provider marked unavailable." };
      }
      return {
        available: true,
        message: "Mock provider is always available.",
        capabilities: {
          ...capabilities,
          textGeneration: "verified",
          structuredJson: "verified",
          cancellation: "verified",
          localExecution: "verified",
        },
        models: [model],
      };
    },

    async generate(request: AIRequest): Promise<AIResponse> {
      const started = Date.now();
      const maxRepair = request.maxRepairAttempts ?? 1;
      let system = request.system;
      let input = request.input;
      let repaired = false;
      let lastText = "";

      for (let attempt = 0; attempt <= maxRepair; attempt++) {
        lastText = await generateOnce(request, system, input);
        try {
          const validated = validateStructuredOutput(
            lastText,
            request.outputSchema
          );
          return {
            text: validated.text,
            data: validated.data,
            providerId: options.id,
            model,
            durationMs: Date.now() - started,
            usage: { inputTokens: 10, outputTokens: 20 },
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
            lastText,
            error.message
          );
          system = repair.system;
          input = repair.input;
        }
      }

      throw new AIError("Mock provider exhausted repair attempts.", {
        code: "VALIDATION_FAILED",
        providerId: options.id,
      });
    },
  };
}

export function mockProviderFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  return createMockProvider({
    id: ctx.id,
    name: ctx.name,
    model: ctx.model,
    ...(ctx.settings as MockProviderOptions | undefined),
  });
}
