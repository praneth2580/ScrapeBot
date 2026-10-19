import type {
  AIProvider,
  AIRequest,
  AIResponse,
  AvailabilityResult,
  ProviderFactoryContext,
} from "../../types";
import { defaultCapabilitiesForKind } from "../../registry";
import { AIError } from "../../errors";
import { validateStructuredOutput } from "../../structured";
import { probeCliHelp, runCli, whichSync } from "./base";

/**
 * Cursor agent / CLI adapter.
 *
 * IMPORTANT:
 * - Uses only documented non-interactive CLI entrypoints when present.
 * - Does not scrape interactive terminals or rely on undocumented internals.
 * - Does not bypass authentication or subscriptions.
 * - Structured JSON is marked unsupported unless help output and a successful
 *   validated run prove otherwise.
 *
 * Default executable candidates (first found on PATH wins):
 * - agent (Cursor Agent CLI when installed)
 * - cursor-agent
 *
 * Settings:
 * - executable: override path/basename
 * - printFlag: flag used for non-interactive output (default "--print")
 * - extraArgs: additional args prepended before the prompt
 */
export function createCursorCliProvider(options: {
  id: string;
  name: string;
  executable?: string;
  model?: string;
  timeoutMs?: number;
  printFlag?: string;
  extraArgs?: string[];
}): AIProvider {
  const capabilities = {
    ...defaultCapabilitiesForKind("cli"),
    textGeneration: "unknown" as const,
    structuredJson: "unsupported" as const,
    localExecution: "supported" as const,
    cancellation: "supported" as const,
  };

  const printFlag = options.printFlag ?? "--print";

  function resolveExecutable(): string | undefined {
    if (options.executable) {
      return options.executable.includes("/") || options.executable.includes("\\")
        ? options.executable
        : whichSync(options.executable) || options.executable;
    }
    return whichSync("agent") || whichSync("cursor-agent");
  }

  return {
    id: options.id,
    kind: "cli",
    name: options.name,
    capabilities,
    isCloud: false,

    async checkAvailability(): Promise<AvailabilityResult> {
      const executable = resolveExecutable();
      if (!executable) {
        return {
          available: false,
          message:
            "No Cursor agent CLI found on PATH (tried: agent, cursor-agent). Install the documented Cursor Agent CLI or set settings.executable.",
          capabilities,
        };
      }

      const probe = await probeCliHelp({
        executable,
        helpArgs: ["--help"],
        // Require evidence of a non-interactive print/output mode in help text.
        requiredHelpTokens: [printFlag.replace(/^--/, ""), "print"],
      });

      if (!probe.installed) {
        return {
          available: false,
          message: probe.message,
          capabilities,
        };
      }

      if (!probe.supportsRequiredTokens) {
        return {
          available: false,
          message: `${probe.message} Non-interactive mode is required; interactive-only CLIs are not supported.`,
          capabilities: {
            ...capabilities,
            textGeneration: "unsupported",
            structuredJson: "unsupported",
          },
        };
      }

      return {
        available: true,
        message: probe.message,
        capabilities: {
          ...capabilities,
          textGeneration: "verified",
          structuredJson: "unsupported",
          cancellation: "verified",
          localExecution: "verified",
        },
      };
    },

    async generate(request: AIRequest): Promise<AIResponse> {
      if (request.outputSchema) {
        throw new AIError(
          "Cursor CLI adapter does not claim reliable structured JSON output. Use an API or local model provider for structured tasks.",
          {
            code: "CAPABILITY_UNSUPPORTED",
            providerId: options.id,
          }
        );
      }

      const executable = resolveExecutable();
      if (!executable) {
        throw new AIError("Cursor agent CLI is not installed.", {
          code: "PROVIDER_UNAVAILABLE",
          providerId: options.id,
        });
      }

      const availability = await this.checkAvailability();
      if (!availability.available) {
        throw new AIError(
          availability.message || "Cursor CLI is not usable.",
          { code: "PROVIDER_UNAVAILABLE", providerId: options.id }
        );
      }

      const prompt =
        typeof request.input === "string"
          ? request.input
          : JSON.stringify(request.input);

      const args = [
        ...(options.extraArgs ?? []),
        printFlag,
        // Prompt as a discrete argv element — never shell-interpolated.
        `${request.system}\n\n${prompt}`,
      ];

      const result = await runCli({
        executable,
        args,
        timeoutMs: request.timeoutMs ?? options.timeoutMs ?? 180_000,
        signal: request.signal,
        maxOutputBytes: 512_000,
      });

      if (result.exitCode !== 0) {
        throw new AIError(
          `Cursor CLI exited with code ${result.exitCode}: ${result.stderr.slice(0, 400) || "no stderr"}`,
          { code: "CLI_FAILED", providerId: options.id }
        );
      }

      const text = result.stdout.trim();
      if (!text) {
        throw new AIError("Cursor CLI returned empty stdout.", {
          code: "INVALID_RESPONSE",
          providerId: options.id,
        });
      }

      const validated = validateStructuredOutput(text, request.outputSchema);

      return {
        text: validated.text,
        data: validated.data,
        providerId: options.id,
        model: options.model,
        durationMs: result.durationMs,
      };
    },
  };
}

export function cursorCliProviderFactory(
  ctx: ProviderFactoryContext
): AIProvider {
  const settings = ctx.settings ?? {};
  return createCursorCliProvider({
    id: ctx.id,
    name: ctx.name,
    model: ctx.model,
    timeoutMs: ctx.timeoutMs,
    executable:
      typeof settings.executable === "string"
        ? settings.executable
        : undefined,
    printFlag:
      typeof settings.printFlag === "string" ? settings.printFlag : undefined,
    extraArgs: Array.isArray(settings.extraArgs)
      ? settings.extraArgs.map(String)
      : undefined,
  });
}
