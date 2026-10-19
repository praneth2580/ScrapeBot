import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AIError } from "../../errors";

export type CliRunOptions = {
  executable: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  /** stdin payload when the CLI accepts non-interactive input */
  stdin?: string;
};

export type CliRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  durationMs: number;
};

/**
 * Allowlist of executable basenames that may be invoked by CLI providers.
 * Paths must resolve to an existing file; shell concatenation is never used.
 */
export const CLI_EXECUTABLE_ALLOWLIST = new Set([
  "agent",
  "cursor-agent",
  "cursor",
]);

export function assertAllowedExecutable(executable: string): string {
  const resolved = path.isAbsolute(executable)
    ? executable
    : executable.includes(path.sep)
      ? path.resolve(executable)
      : executable;

  const base = path.basename(resolved);
  if (!CLI_EXECUTABLE_ALLOWLIST.has(base)) {
    throw new AIError(
      `Executable "${base}" is not on the CLI allowlist.`,
      { code: "CLI_FAILED" }
    );
  }

  if (resolved.includes(path.sep)) {
    if (!fs.existsSync(resolved)) {
      throw new AIError(`Executable not found: ${resolved}`, {
        code: "PROVIDER_UNAVAILABLE",
      });
    }
  }

  return resolved;
}

export function whichSync(command: string): string | undefined {
  const pathEnv = process.env.PATH || "";
  const parts = pathEnv.split(path.delimiter);
  const extensions =
    process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];

  for (const dir of parts) {
    for (const ext of extensions) {
      const candidate = path.join(dir, command + ext);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // continue
      }
    }
  }
  return undefined;
}

/**
 * Spawn a CLI process with argument arrays (never shell:true).
 */
export function runCli(options: CliRunOptions): Promise<CliRunResult> {
  const executable = assertAllowedExecutable(options.executable);
  const timeoutMs = options.timeoutMs ?? 120_000;
  const maxOutputBytes = options.maxOutputBytes ?? 512_000;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(
        new AIError("CLI request was cancelled.", { code: "CANCELLED" })
      );
      return;
    }

    const child = spawn(executable, options.args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuf: Buffer = Buffer.alloc(0);
    let stderrBuf: Buffer = Buffer.alloc(0);
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const finish = (result: CliRunResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref?.();
    }, timeoutMs);

    const onAbort = () => {
      child.kill("SIGTERM");
      fail(new AIError("CLI request was cancelled.", { code: "CANCELLED" }));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const append = (
      current: Buffer,
      chunk: Buffer
    ): Buffer => {
      if (truncated) return current;
      if (current.length + chunk.length > maxOutputBytes) {
        truncated = true;
        const remaining = Math.max(0, maxOutputBytes - current.length);
        child.kill("SIGTERM");
        return Buffer.concat([current, chunk.subarray(0, remaining)]);
      }
      return Buffer.concat([current, chunk]);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf = append(stdoutBuf, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf = append(stderrBuf, chunk);
    });

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin);
    }
    child.stdin?.end();

    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      fail(
        new AIError(`Failed to spawn CLI: ${error.message}`, {
          code: "PROVIDER_UNAVAILABLE",
          cause: error,
        })
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);

      if (truncated) {
        fail(
          new AIError("CLI output exceeded the configured size limit.", {
            code: "OUTPUT_LIMIT",
          })
        );
        return;
      }

      if (timedOut) {
        fail(
          new AIError(`CLI timed out after ${timeoutMs}ms.`, {
            code: "TIMEOUT",
            retryable: true,
          })
        );
        return;
      }

      finish({
        stdout: stdoutBuf.toString("utf8"),
        stderr: stderrBuf.toString("utf8"),
        exitCode: code,
        timedOut,
        truncated,
        durationMs: Date.now() - started,
      });
    });
  });
}

export type CliCapabilityProbe = {
  executable: string;
  /** Candidate flags to probe, e.g. ["--help"], ["-h"] */
  helpArgs?: string[];
  /** Substrings that indicate non-interactive / print mode support */
  requiredHelpTokens?: string[];
};

export async function probeCliHelp(
  probe: CliCapabilityProbe
): Promise<{
  installed: boolean;
  path?: string;
  helpText?: string;
  supportsRequiredTokens: boolean;
  missingTokens: string[];
  message: string;
}> {
  const resolved =
    probe.executable.includes(path.sep) || path.isAbsolute(probe.executable)
      ? probe.executable
      : whichSync(probe.executable);

  if (!resolved) {
    return {
      installed: false,
      supportsRequiredTokens: false,
      missingTokens: probe.requiredHelpTokens ?? [],
      message: `Executable "${probe.executable}" was not found on PATH.`,
    };
  }

  try {
    assertAllowedExecutable(resolved);
  } catch (error) {
    return {
      installed: false,
      path: resolved,
      supportsRequiredTokens: false,
      missingTokens: probe.requiredHelpTokens ?? [],
      message: error instanceof Error ? error.message : "Executable blocked.",
    };
  }

  const helpArgs = probe.helpArgs ?? ["--help"];
  try {
    const result = await runCli({
      executable: resolved,
      args: helpArgs,
      timeoutMs: 10_000,
      maxOutputBytes: 200_000,
    });
    const helpText = `${result.stdout}\n${result.stderr}`;
    const required = probe.requiredHelpTokens ?? [];
    const missingTokens = required.filter(
      (token) => !helpText.toLowerCase().includes(token.toLowerCase())
    );

    return {
      installed: true,
      path: resolved,
      helpText,
      supportsRequiredTokens: missingTokens.length === 0,
      missingTokens,
      message:
        missingTokens.length === 0
          ? "CLI installed and help output matches expected options."
          : `CLI installed but missing expected options: ${missingTokens.join(", ")}.`,
    };
  } catch (error) {
    return {
      installed: true,
      path: resolved,
      supportsRequiredTokens: false,
      missingTokens: probe.requiredHelpTokens ?? [],
      message:
        error instanceof Error
          ? error.message
          : "Failed to probe CLI help output.",
    };
  }
}
