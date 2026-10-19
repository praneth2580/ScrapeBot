import { z } from "zod";
import { getAIService } from "@/lib/ai/service";
import { ProviderConfigSchema } from "@/lib/ai/config-schema";
import { jsonError, jsonOk } from "@/lib/ai/http";

export async function GET() {
  try {
    const service = getAIService();
    const [settings, providers] = await Promise.all([
      service.getSettings(),
      service.listProviders(),
    ]);

    return jsonOk({
      settings: {
        schemaVersion: settings.schemaVersion,
        defaultProviderId: settings.defaultProviderId,
        routing: settings.routing,
        maxRepairAttempts: settings.maxRepairAttempts,
        defaultTimeoutMs: settings.defaultTimeoutMs,
      },
      providers,
      kinds: [
        "mock",
        "openai-compatible",
        "ollama",
        "openai",
        "anthropic",
        "google",
        "custom",
        "cli",
      ],
    });
  } catch (error) {
    return jsonError(error);
  }
}

const UpsertBodySchema = z.object({
  provider: ProviderConfigSchema,
  apiKey: z.string().nullable().optional(),
  setDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = UpsertBodySchema.parse(await request.json());
    const service = getAIService();
    await service.upsertProvider(
      body.provider,
      body.apiKey === undefined ? undefined : body.apiKey
    );

    if (body.setDefault) {
      await service.setDefaultProvider(body.provider.id);
    }

    const settings = await service.getSettings();
    const providers = await service.listProviders();

    return jsonOk({ settings, providers, created: true }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
