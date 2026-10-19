import { z } from "zod";
import { getAIService } from "@/lib/ai/service";
import { ProviderConfigSchema } from "@/lib/ai/config-schema";
import { AIError } from "@/lib/ai/errors";
import { jsonError, jsonOk } from "@/lib/ai/http";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = z
      .object({
        provider: ProviderConfigSchema.partial().extend({
          id: z.string().optional(),
          name: z.string().min(1).optional(),
          kind: ProviderConfigSchema.shape.kind.optional(),
        }),
        apiKey: z.string().nullable().optional(),
      })
      .parse(await request.json());

    const service = getAIService();
    const settings = await service.getSettings();
    const existing = settings.providers.find((p) => p.id === id);
    if (!existing) {
      throw new AIError(`Provider "${id}" not found.`, {
        code: "PROVIDER_NOT_FOUND",
        providerId: id,
      });
    }

    const merged = ProviderConfigSchema.parse({
      ...existing,
      ...body.provider,
      id,
    });

    await service.upsertProvider(
      merged,
      body.apiKey === undefined ? undefined : body.apiKey
    );

    return jsonOk({
      settings: await service.getSettings(),
      providers: await service.listProviders(),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const service = getAIService();
    const result = await service.removeProvider(id);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
