import { z } from "zod";
import { getAIService } from "@/lib/ai/service";
import { RoutingConfigSchema } from "@/lib/ai/config-schema";
import { jsonError, jsonOk } from "@/lib/ai/http";

export async function GET() {
  try {
    const settings = await getAIService().getSettings();
    return jsonOk({ routing: settings.routing, defaultProviderId: settings.defaultProviderId });
  } catch (error) {
    return jsonError(error);
  }
}

const BodySchema = z.object({
  routing: RoutingConfigSchema.partial().optional(),
  defaultProviderId: z.string().min(1).optional(),
});

export async function PUT(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const service = getAIService();

    if (body.defaultProviderId) {
      await service.setDefaultProvider(body.defaultProviderId);
    }

    if (body.routing) {
      const current = await service.getSettings();
      await service.updateRouting({
        ...current.routing,
        ...body.routing,
        fallbackProviderIds:
          body.routing.fallbackProviderIds ??
          current.routing.fallbackProviderIds,
        allowCloudFallback:
          body.routing.allowCloudFallback ??
          current.routing.allowCloudFallback,
        mode: body.routing.mode ?? current.routing.mode,
      });
    }

    const settings = await service.getSettings();
    return jsonOk({
      routing: settings.routing,
      defaultProviderId: settings.defaultProviderId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
