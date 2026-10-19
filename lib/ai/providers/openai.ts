import type { AIProvider, ProviderFactoryContext } from "../types";
import { AIError } from "../errors";
import { createOpenAICompatibleProvider } from "./openai-compatible";

const DEFAULT_OPENAI_URL = "https://api.openai.com/v1";

/**
 * OpenAI hosted API via the documented OpenAI-compatible HTTP surface.
 * Uses fetch only — no mandatory openai SDK install.
 */
export function openaiProviderFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  if (!ctx.model) {
    throw new AIError("model is required for OpenAI providers.", {
      code: "CONFIG_INVALID",
    });
  }

  if (!ctx.apiKey) {
    throw new AIError(
      "API key is required for OpenAI. Configure a secret or set OPENAI_API_KEY.",
      { code: "SECRET_MISSING" }
    );
  }

  return createOpenAICompatibleProvider({
    id: ctx.id,
    name: ctx.name,
    baseUrl: ctx.baseUrl || DEFAULT_OPENAI_URL,
    model: ctx.model,
    apiKey: ctx.apiKey,
    timeoutMs: ctx.timeoutMs,
    allowPrivateEndpoints: false,
    isCloud: true,
    kind: "openai",
  });
}
