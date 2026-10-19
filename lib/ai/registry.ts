import type {
  AIProvider,
  ProviderFactory,
  ProviderFactoryContext,
  ProviderKind,
} from "./types";
import { AIError } from "./errors";
import { KIND_CAPABILITY_DEFAULTS } from "./capabilities";

type RegistryEntry = {
  kind: ProviderKind;
  factory: ProviderFactory;
  lazy?: boolean;
};

const registry = new Map<ProviderKind, RegistryEntry>();

export function registerProviderFactory(
  kind: ProviderKind,
  factory: ProviderFactory,
  options?: { lazy?: boolean }
) {
  registry.set(kind, {
    kind,
    factory,
    lazy: options?.lazy ?? true,
  });
}

export function getRegisteredKinds(): ProviderKind[] {
  return [...registry.keys()];
}

export function hasProviderFactory(kind: ProviderKind): boolean {
  return registry.has(kind);
}

export async function createProviderFromFactory(
  kind: ProviderKind,
  ctx: ProviderFactoryContext
): Promise<AIProvider> {
  const entry = registry.get(kind);
  if (!entry) {
    throw new AIError(
      `No provider adapter registered for kind "${kind}".`,
      { code: "PROVIDER_NOT_FOUND" }
    );
  }

  try {
    return await entry.factory(ctx);
  } catch (error) {
    if (error instanceof AIError) throw error;
    const message =
      error instanceof Error ? error.message : "Failed to create provider.";
    if (/Cannot find module|ERR_MODULE_NOT_FOUND/i.test(message)) {
      throw new AIError(
        `Optional SDK for provider kind "${kind}" is not installed.`,
        { code: "SDK_MISSING", cause: error }
      );
    }
    throw new AIError(message, {
      code: "PROVIDER_UNAVAILABLE",
      cause: error,
    });
  }
}

/** In-memory live provider instances keyed by config id */
export class ProviderRegistry {
  private providers = new Map<string, AIProvider>();

  set(provider: AIProvider) {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  delete(id: string) {
    this.providers.delete(id);
  }

  clear() {
    this.providers.clear();
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }

  require(id: string): AIProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new AIError(`Provider "${id}" is not loaded.`, {
        code: "PROVIDER_NOT_FOUND",
        providerId: id,
      });
    }
    return provider;
  }
}

export function defaultCapabilitiesForKind(kind: ProviderKind) {
  return { ...KIND_CAPABILITY_DEFAULTS[kind] };
}
