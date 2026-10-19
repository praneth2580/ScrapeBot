import { getAIService } from "@/lib/ai/service";
import { jsonError, jsonOk } from "@/lib/ai/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const result = await getAIService().checkProvider(id);
    return jsonOk({ providerId: id, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
