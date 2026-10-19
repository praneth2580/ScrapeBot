import type {
  AIProvider,
  AIRequest,
  AITask,
  RouteResult,
} from "./types";
import type { AISettings } from "./config-schema";
import { AIError } from "./errors";
import type { ProviderRegistry } from "./registry";

export type RouterOptions = {
  settings: AISettings;
  registry: ProviderRegistry;
};

/**
 * Task-based provider selection with explicit fallback privacy controls.
 */
export class AIRouter {
  constructor(private readonly options: RouterOptions) {}

  updateSettings(settings: AISettings) {
    this.options.settings = settings;
  }

  resolveCandidateIds(task: AITask): string[] {
    const { settings } = this.options;
    const { routing, defaultProviderId } = settings;

    if (routing.mode === "per-task") {
      const mapped = routing.taskProviders?.[task];
      const primary = mapped || defaultProviderId;
      return unique([primary, ...routing.fallbackProviderIds]);
    }

    if (routing.mode === "fallback") {
      return unique([defaultProviderId, ...routing.fallbackProviderIds]);
    }

    // selected
    return [defaultProviderId];
  }

  async route(request: AIRequest): Promise<RouteResult> {
    const candidateIds = this.resolveCandidateIds(request.task);
    const attempted: string[] = [];
    let lastError: AIError | undefined;
    const primaryId = candidateIds[0];

    for (let i = 0; i < candidateIds.length; i++) {
      const providerId = candidateIds[i];
      const provider = this.options.registry.get(providerId);

      if (!provider) {
        lastError = new AIError(`Provider "${providerId}" is not loaded.`, {
          code: "PROVIDER_NOT_FOUND",
          providerId,
        });
        attempted.push(providerId);
        continue;
      }

      // Privacy: never silently fall back to cloud when disabled
      if (i > 0 && provider.isCloud && !this.options.settings.routing.allowCloudFallback) {
        lastError = new AIError(
          `Refusing cloud fallback to "${providerId}" because allowCloudFallback is false.`,
          { code: "FALLBACK_REFUSED", providerId }
        );
        attempted.push(providerId);
        continue;
      }

      // CLI providers are not interchangeable with completion APIs for structured tasks
      if (
        i > 0 &&
        provider.kind === "cli" &&
        request.outputSchema
      ) {
        lastError = new AIError(
          `Skipping CLI provider "${providerId}" for structured task fallback.`,
          { code: "CAPABILITY_UNSUPPORTED", providerId }
        );
        attempted.push(providerId);
        continue;
      }

      attempted.push(providerId);

      try {
        const response = await provider.generate({
          ...request,
          maxRepairAttempts:
            request.maxRepairAttempts ??
            this.options.settings.maxRepairAttempts,
          timeoutMs:
            request.timeoutMs ?? this.options.settings.defaultTimeoutMs,
        });

        return {
          response,
          attemptedProviderIds: attempted,
          usedFallback: providerId !== primaryId,
        };
      } catch (error) {
        lastError =
          error instanceof AIError
            ? error
            : new AIError(
                error instanceof Error ? error.message : "Provider failed.",
                { code: "PROVIDER_UNAVAILABLE", providerId, cause: error }
              );

        // selected mode: no fallback
        if (this.options.settings.routing.mode === "selected") {
          throw lastError;
        }
      }
    }

    throw (
      lastError ??
      new AIError("No eligible providers available for this task.", {
        code: "PROVIDER_UNAVAILABLE",
      })
    );
  }

  getProvider(id: string): AIProvider | undefined {
    return this.options.registry.get(id);
  }
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
