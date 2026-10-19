export type AIErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_NOT_FOUND"
  | "MODEL_NOT_FOUND"
  | "AUTH_FAILED"
  | "TIMEOUT"
  | "CANCELLED"
  | "INVALID_RESPONSE"
  | "VALIDATION_FAILED"
  | "CAPABILITY_UNSUPPORTED"
  | "FALLBACK_REFUSED"
  | "CONFIG_INVALID"
  | "SECRET_MISSING"
  | "ENDPOINT_BLOCKED"
  | "SDK_MISSING"
  | "CLI_FAILED"
  | "OUTPUT_LIMIT"
  | "RATE_LIMITED"
  | "UNKNOWN";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly providerId?: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      code: AIErrorCode;
      providerId?: string;
      retryable?: boolean;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "AIError";
    this.code = options.code;
    this.providerId = options.providerId;
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }

  /** Safe for API responses and logs — never includes secrets. */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      providerId: this.providerId,
      retryable: this.retryable,
    };
  }
}

export function isAIError(error: unknown): error is AIError {
  return error instanceof AIError;
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1[REDACTED]")
    .replace(/(sk-[A-Za-z0-9]{8,})/g, "[REDACTED]")
    .replace(/(xai-[A-Za-z0-9]{8,})/g, "[REDACTED]")
    .replace(/(AIza[A-Za-z0-9_\-]{8,})/g, "[REDACTED]");
}

export function toAIError(
  error: unknown,
  providerId?: string,
  fallbackCode: AIErrorCode = "UNKNOWN"
): AIError {
  if (error instanceof AIError) {
    return error;
  }

  if (error instanceof Error) {
    const name = error.name;
    const msg = sanitizeErrorMessage(error.message);

    if (name === "AbortError" || name === "TimeoutError") {
      return new AIError(
        name === "TimeoutError" ? "Provider request timed out." : "Provider request was cancelled.",
        {
          code: name === "TimeoutError" ? "TIMEOUT" : "CANCELLED",
          providerId,
          retryable: name === "TimeoutError",
          cause: error,
        }
      );
    }

    if (/401|unauthorized|invalid.?api.?key|authentication/i.test(msg)) {
      return new AIError("Authentication failed. Check the stored API key.", {
        code: "AUTH_FAILED",
        providerId,
        cause: error,
      });
    }

    if (/404|model.?not.?found|does not exist/i.test(msg)) {
      return new AIError(msg, {
        code: "MODEL_NOT_FOUND",
        providerId,
        cause: error,
      });
    }

    if (/429|rate.?limit/i.test(msg)) {
      return new AIError(msg, {
        code: "RATE_LIMITED",
        providerId,
        retryable: true,
        cause: error,
      });
    }

    return new AIError(msg, {
      code: fallbackCode,
      providerId,
      cause: error,
    });
  }

  return new AIError("Unknown provider error.", {
    code: fallbackCode,
    providerId,
    cause: error,
  });
}
