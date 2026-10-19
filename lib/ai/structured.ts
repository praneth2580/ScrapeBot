import { z, type ZodType } from "zod";
import { AIError } from "./errors";

function isZodSchema(value: unknown): value is ZodType {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof (value as ZodType).safeParse === "function"
  );
}

/**
 * Extract a JSON object/array from model text (handles fenced code blocks).
 */
export function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    return fence[1].trim();
  }

  const objectMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (objectMatch?.[1]) {
    return objectMatch[1];
  }

  return trimmed;
}

export function parseJsonLoose(text: string): unknown {
  const candidate = extractJsonText(text);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new AIError("Model returned malformed JSON.", {
      code: "INVALID_RESPONSE",
      cause: error,
    });
  }
}

export type ValidateStructuredResult<T> = {
  data: T;
  repairedText?: string;
};

/**
 * Validate model output against a Zod schema or accept raw text when no schema.
 */
export function validateStructuredOutput<T = unknown>(
  text: string,
  outputSchema?: unknown
): { data?: T; text: string } {
  if (!outputSchema) {
    return { text };
  }

  if (!isZodSchema(outputSchema)) {
    // JSON-Schema-like objects are not validated here; callers should pass Zod.
    // Still attempt to parse JSON for consumers.
    const data = parseJsonLoose(text) as T;
    return { text, data };
  }

  const parsed = parseJsonLoose(text);
  const result = outputSchema.safeParse(parsed);
  if (!result.success) {
    throw new AIError(
      `Structured output failed validation: ${result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
      { code: "VALIDATION_FAILED", cause: result.error }
    );
  }

  return { text, data: result.data as T };
}

export function buildRepairPrompt(
  originalSystem: string,
  originalInput: unknown,
  invalidText: string,
  validationError: string
): { system: string; input: unknown } {
  return {
    system: `${originalSystem}

Your previous response failed schema validation. Return ONLY valid JSON matching the required schema. No markdown fences or commentary.`,
    input: {
      originalInput,
      invalidResponse: invalidText,
      validationError,
    },
  };
}

/** Minimal schema used by connection tests */
export const ConnectionTestSchema = z.object({
  ok: z.boolean(),
  message: z.string().min(1),
});

export type ConnectionTestResult = z.infer<typeof ConnectionTestSchema>;
