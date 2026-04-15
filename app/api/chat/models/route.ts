import type {
  AddChatModelRequest,
  ChatModelOption,
} from "@/app/_components/chat/types";
import {
  getDefaultOllamaModel,
  ollama,
  resolveAvailableOllamaModel,
} from "@/app/lib/ollama";

async function getModelPayload(preferredModel?: string) {
  const response = await ollama.listModels();
  const defaultModel = await resolveAvailableOllamaModel(preferredModel);
  const models: ChatModelOption[] = response.models.map((model) => ({
    label:
      model.details?.parameter_size && model.details?.family
        ? `${model.name} (${model.details.family}, ${model.details.parameter_size})`
        : model.name,
    value: model.name,
  }));

  return {
    defaultModel,
    models,
  };
}

export async function GET() {
  const configuredDefault = getDefaultOllamaModel();

  try {
    return Response.json(await getModelPayload(configuredDefault));
  } catch {
    return Response.json({
      defaultModel: configuredDefault,
      models: [{ label: configuredDefault, value: configuredDefault }],
    });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<AddChatModelRequest>;
  const model = body.model?.trim();

  if (!model) {
    return Response.json({ error: "Model name is required." }, { status: 400 });
  }

  try {
    await ollama.pullModel(model);
    return Response.json(await getModelPayload(model), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to pull Ollama model.";

    return Response.json({ error: message }, { status: 502 });
  }
}
