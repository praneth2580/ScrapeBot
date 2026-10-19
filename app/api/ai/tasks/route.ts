import { z } from "zod";
import { getAIService } from "@/lib/ai/service";
import { AITaskSchema } from "@/lib/ai/config-schema";
import { jsonError, jsonOk } from "@/lib/ai/http";

const BodySchema = z.object({
  task: AITaskSchema,
  system: z.string().min(1).max(20_000),
  input: z.unknown(),
  model: z.string().max(200).optional(),
  timeoutMs: z.number().int().positive().max(900_000).optional(),
});

/**
 * Run a structured AI task through the configured router.
 * Credentials and raw provider payloads stay on the server.
 */
export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const result = await getAIService().runTask({
      task: body.task,
      system: body.system,
      input: body.input,
      model: body.model,
      timeoutMs: body.timeoutMs,
    });

    return jsonOk({
      text: result.response.text,
      data: result.response.data,
      providerId: result.response.providerId,
      model: result.response.model,
      durationMs: result.response.durationMs,
      usage: result.response.usage,
      repaired: result.response.repaired,
      attemptedProviderIds: result.attemptedProviderIds,
      usedFallback: result.usedFallback,
    });
  } catch (error) {
    return jsonError(error);
  }
}
