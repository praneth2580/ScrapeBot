import type { AIProvider, ProviderFactoryContext } from "../types";
import { AIError } from "../errors";
import { createOpenAICompatibleProvider } from "./openai-compatible";

/**
 * User-defined OpenAI-compatible endpoint (LM Studio, vLLM, custom gateways).
 */
export function customProviderFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  if (!ctx.baseUrl) {
    throw new AIError("baseUrl is required for custom providers.", {
      code: "CONFIG_INVALID",
    });
  }
  if (!ctx.model) {
    throw new AIError("model is required for custom providers.", {
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
    kind: "custom",
    headers:
      typeof settings.headers === "object" && settings.headers
        ? (settings.headers as Record<string, string>)
        : undefined,
  });
}
