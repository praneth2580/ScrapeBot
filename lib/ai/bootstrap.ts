import { registerProviderFactory } from "./registry";
import { mockProviderFactory } from "./providers/mock";
import { openAICompatibleFactory } from "./providers/openai-compatible";
import { ollamaProviderFactory } from "./providers/ollama";
import { openaiProviderFactory } from "./providers/openai";
import { anthropicProviderFactory } from "./providers/anthropic";
import { googleProviderFactory } from "./providers/google";
import { customProviderFactory } from "./providers/custom";
import { cursorCliProviderFactory } from "./providers/cli/cursor";

let bootstrapped = false;

/**
 * Register built-in provider factories (lazy — SDKs not required).
 */
export function bootstrapAIProviders() {
  if (bootstrapped) return;
  bootstrapped = true;

  registerProviderFactory("mock", mockProviderFactory, { lazy: false });
  registerProviderFactory("openai-compatible", openAICompatibleFactory);
  registerProviderFactory("ollama", ollamaProviderFactory);
  registerProviderFactory("openai", openaiProviderFactory);
  registerProviderFactory("anthropic", anthropicProviderFactory);
  registerProviderFactory("google", googleProviderFactory);
  registerProviderFactory("custom", customProviderFactory);
  registerProviderFactory("cli", cursorCliProviderFactory);
}

/** Test helper */
export function resetBootstrapForTests() {
  bootstrapped = false;
}
