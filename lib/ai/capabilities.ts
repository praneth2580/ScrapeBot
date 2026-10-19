import type { CapabilityMap, CapabilityName, CapabilityStatus } from "./types";

export const ALL_CAPABILITIES: CapabilityName[] = [
  "textGeneration",
  "structuredJson",
  "streaming",
  "vision",
  "toolCalling",
  "embeddings",
  "cancellation",
  "localExecution",
];

/** Declared defaults per provider kind — not verified until a live check. */
export const KIND_CAPABILITY_DEFAULTS: Record<string, CapabilityMap> = {
  mock: {
    textGeneration: "supported",
    structuredJson: "supported",
    streaming: "unsupported",
    vision: "unsupported",
    toolCalling: "unsupported",
    embeddings: "unsupported",
    cancellation: "supported",
    localExecution: "supported",
  },
  "openai-compatible": {
    textGeneration: "supported",
    structuredJson: "unknown",
    streaming: "unknown",
    vision: "unknown",
    toolCalling: "unknown",
    embeddings: "unknown",
    cancellation: "supported",
    localExecution: "unknown",
  },
  ollama: {
    textGeneration: "supported",
    structuredJson: "supported",
    streaming: "supported",
    vision: "unknown",
    toolCalling: "unknown",
    embeddings: "supported",
    cancellation: "supported",
    localExecution: "supported",
  },
  openai: {
    textGeneration: "supported",
    structuredJson: "supported",
    streaming: "supported",
    vision: "supported",
    toolCalling: "supported",
    embeddings: "supported",
    cancellation: "supported",
    localExecution: "unsupported",
  },
  anthropic: {
    textGeneration: "supported",
    structuredJson: "supported",
    streaming: "supported",
    vision: "supported",
    toolCalling: "supported",
    embeddings: "unsupported",
    cancellation: "supported",
    localExecution: "unsupported",
  },
  google: {
    textGeneration: "supported",
    structuredJson: "supported",
    streaming: "supported",
    vision: "supported",
    toolCalling: "supported",
    embeddings: "supported",
    cancellation: "supported",
    localExecution: "unsupported",
  },
  custom: {
    textGeneration: "unknown",
    structuredJson: "unknown",
    streaming: "unknown",
    vision: "unknown",
    toolCalling: "unknown",
    embeddings: "unknown",
    cancellation: "supported",
    localExecution: "unknown",
  },
  cli: {
    textGeneration: "unknown",
    structuredJson: "unsupported",
    streaming: "unsupported",
    vision: "unsupported",
    toolCalling: "unsupported",
    embeddings: "unsupported",
    cancellation: "supported",
    localExecution: "supported",
  },
};

export function mergeCapabilities(
  base: CapabilityMap,
  override?: CapabilityMap
): CapabilityMap {
  return { ...base, ...override };
}

export function hasCapability(
  map: CapabilityMap,
  name: CapabilityName,
  requireVerified = false
): boolean {
  const status = map[name];
  if (!status) return false;
  if (requireVerified) return status === "verified";
  return status === "supported" || status === "verified";
}

export function markVerified(
  map: CapabilityMap,
  names: CapabilityName[]
): CapabilityMap {
  const next: CapabilityMap = { ...map };
  for (const name of names) {
    const current = next[name];
    if (current === "supported" || current === "unknown") {
      next[name] = "verified";
    }
  }
  return next;
}

export function capabilitySummary(map: CapabilityMap): Record<
  CapabilityName,
  CapabilityStatus | "absent"
> {
  const out = {} as Record<CapabilityName, CapabilityStatus | "absent">;
  for (const name of ALL_CAPABILITIES) {
    out[name] = map[name] ?? "absent";
  }
  return out;
}
