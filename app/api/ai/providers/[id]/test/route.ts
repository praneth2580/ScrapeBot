import { z } from "zod";
import { getAIService } from "@/lib/ai/service";
import { jsonError, jsonOk } from "@/lib/ai/http";

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  prompt: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await request.json().catch(() => ({})));
    const response = await getAIService().testProvider(id, body.prompt);

    return jsonOk({
      providerId: response.providerId,
      model: response.model,
      text: response.text,
      data: response.data,
      durationMs: response.durationMs,
      usage: response.usage,
      repaired: response.repaired,
    });
  } catch (error) {
    return jsonError(error);
  }
}
