import type {
  AddChatModelRequest,
  ChatModelOption,
} from "@/app/_components/chat/types";
import {
  getDefaultOllamaModel,
  ollama,
  resolveAvailableOllamaModel,
} from "@/app/lib/ollama";

function splitModelName(modelName: string) {
  const [baseName, rawVersion] = modelName.split(":");
  const segments = baseName.split(/(?=[0-9])/);
  const name = segments[0] || baseName;
  const inlineVersion = segments.slice(1).join("");

  return {
    name,
    version: rawVersion || inlineVersion || "latest",
  };
}

function getContextWindow(modelInfo?: Record<string, string | number | boolean | null>) {
  const candidates = [
    modelInfo?.["llama.context_length"],
    modelInfo?.["general.context_length"],
    modelInfo?.["gemma.context_length"],
    modelInfo?.["qwen2.context_length"],
    modelInfo?.["qwen2vl.context_length"],
    modelInfo?.["mistral.context_length"],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function getModelPayload(preferredModel?: string) {
  const response = await ollama.listModels();
  const defaultModel = await resolveAvailableOllamaModel(preferredModel);
  const models: ChatModelOption[] = await Promise.all(
    response.models.map(async (model) => {
      const { name, version } = splitModelName(model.name);

      try {
        const details = await ollama.showModel(model.name);

        return {
          value: model.name,
          name,
          version,
          family: details.details?.family || model.details?.family,
          parameterSize:
            details.details?.parameter_size || model.details?.parameter_size,
          quantization:
            details.details?.quantization_level ||
            model.details?.quantization_level,
          contextWindow: getContextWindow(details.model_info),
        };
      } catch {
        return {
          value: model.name,
          name,
          version,
          family: model.details?.family,
          parameterSize: model.details?.parameter_size,
          quantization: model.details?.quantization_level,
          contextWindow: null,
        };
      }
    })
  );

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
      models: [
        {
          value: configuredDefault,
          name: configuredDefault.split(":")[0] || configuredDefault,
          version: configuredDefault.split(":")[1] || "latest",
          contextWindow: null,
        },
      ],
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
