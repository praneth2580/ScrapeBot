import { NextResponse } from "next/server";
import { isAIError, sanitizeErrorMessage } from "./errors";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, status?: number) {
  if (isAIError(error)) {
    const codeStatus =
      status ??
      (error.code === "CONFIG_INVALID" || error.code === "VALIDATION_FAILED"
        ? 400
        : error.code === "PROVIDER_NOT_FOUND" || error.code === "SECRET_MISSING"
          ? 404
          : error.code === "FALLBACK_REFUSED" ||
              error.code === "ENDPOINT_BLOCKED" ||
              error.code === "CAPABILITY_UNSUPPORTED"
            ? 403
            : error.code === "AUTH_FAILED"
              ? 401
              : 502);

    return NextResponse.json(error.toJSON(), { status: codeStatus });
  }

  const message = sanitizeErrorMessage(
    error instanceof Error ? error.message : "Unexpected error."
  );

  return NextResponse.json(
    {
      name: "Error",
      code: "UNKNOWN" as const,
      message,
      providerId: undefined,
      retryable: false,
    },
    { status: status ?? 500 }
  );
}
