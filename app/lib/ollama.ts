const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.2";
const DEFAULT_REQUEST_TIMEOUT_MS = 300_000;

export type OllamaRole = "system" | "user" | "assistant" | "tool";

export type OllamaMessage = {
  role: OllamaRole;
  content: string;
  tool_calls?: any[];
};

export type OllamaChatOptions = {
  model?: string;
  messages: OllamaMessage[];
  stream?: boolean;
  keepAlive?: string | number;
  format?: "json" | Record<string, unknown>;
  options?: Record<string, unknown>;
  tools?: any[];
};

export type OllamaGenerateOptions = {
  model?: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  keepAlive?: string | number;
  format?: "json" | Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type OllamaModelSummary = {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
};

export type OllamaChatResponse = {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

export type OllamaGenerateResponse = {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
};

export type OllamaVersionResponse = {
  version: string;
};

export type OllamaTagsResponse = {
  models: OllamaModelSummary[];
};

export type OllamaPullResponse = {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
};

export type OllamaShowResponse = {
  license?: string;
  modelfile?: string;
  parameters?: string;
  template?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
  model_info?: Record<string, string | number | boolean | null>;
};

export type OllamaConnectorOptions = {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  headers?: HeadersInit;
};

export class OllamaError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
    this.details = details;
  }
}

function normalizeBaseUrl(baseUrl?: string) {
  return (baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
}

function normalizeTimeoutMs(timeoutMs?: number) {
  if (typeof timeoutMs === "number" && timeoutMs > 0) {
    return timeoutMs;
  }

  const envValue = Number(process.env.OLLAMA_TIMEOUT_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }

  return DEFAULT_REQUEST_TIMEOUT_MS;
}

function createTimeoutSignal(timeoutMs: number) {
  return AbortSignal.timeout(timeoutMs);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Ollama request failed with status ${response.status}`;

    throw new OllamaError(message, response.status, body);
  }

  return body as T;
}

export function createLocalOllamaConnector(options: OllamaConnectorOptions = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const model = options.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs);
  const defaultHeaders = options.headers;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(defaultHeaders);
    headers.set("Accept", "application/json");

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal: init?.signal || createTimeoutSignal(timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(
          `Ollama timed out after ${Math.round(
            timeoutMs / 1000
          )}s. Increase OLLAMA_TIMEOUT_MS if your local model needs longer.`
        );
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          "Ollama request was aborted before completion. Check the local Ollama server and model load time."
        );
      }

      throw error;
    }

    return parseResponse<T>(response);
  }

  return {
    baseUrl,
    model,
    timeoutMs,
    async health() {
      return request<OllamaVersionResponse>("/api/version");
    },
    async listModels() {
      return request<OllamaTagsResponse>("/api/tags");
    },
    async pullModel(name: string) {
      return request<OllamaPullResponse>("/api/pull", {
        method: "POST",
        body: JSON.stringify({
          name,
          stream: false,
        }),
      });
    },
    async showModel(name: string) {
      return request<OllamaShowResponse>("/api/show", {
        method: "POST",
        body: JSON.stringify({
          model: name,
        }),
      });
    },
    async chat(input: OllamaChatOptions) {
      return request<OllamaChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          model: input.model || model,
          stream: input.stream ?? false,
          messages: input.messages,
          keep_alive: input.keepAlive,
          format: input.format,
          options: input.options,
          tools: input.tools,
        }),
      });
    },
    async generate(input: OllamaGenerateOptions) {
      return request<OllamaGenerateResponse>("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          model: input.model || model,
          prompt: input.prompt,
          system: input.system,
          stream: input.stream ?? false,
          keep_alive: input.keepAlive,
          format: input.format,
          options: input.options,
        }),
      });
    },
  };
}

export const ollama = createLocalOllamaConnector();

export function getDefaultOllamaModel() {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

export async function resolveAvailableOllamaModel(preferredModel?: string) {
  const configuredDefault = getDefaultOllamaModel();
  const response = await ollama.listModels();
  const installedModels = response.models.map((model) => model.name);

  if (installedModels.length === 0) {
    throw new Error(
      "No local Ollama models are installed. Run `ollama pull <model>` first."
    );
  }

  const requestedModel = preferredModel?.trim();

  if (requestedModel && installedModels.includes(requestedModel)) {
    return requestedModel;
  }

  if (installedModels.includes(configuredDefault)) {
    return configuredDefault;
  }

  return installedModels[0];
}
