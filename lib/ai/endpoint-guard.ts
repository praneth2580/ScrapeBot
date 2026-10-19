import { AIError } from "./errors";

/**
 * SSRF protection for custom / OpenAI-compatible endpoints.
 * Loopback and private ranges are blocked unless allowPrivateEndpoints is true.
 */

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254",
]);

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isPrivateOrLocalIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const ranges: Array<[number, number]> = [
    [ipv4ToInt("0.0.0.0"), ipv4ToInt("0.255.255.255")],
    [ipv4ToInt("10.0.0.0"), ipv4ToInt("10.255.255.255")],
    [ipv4ToInt("127.0.0.0"), ipv4ToInt("127.255.255.255")],
    [ipv4ToInt("169.254.0.0"), ipv4ToInt("169.254.255.255")],
    [ipv4ToInt("172.16.0.0"), ipv4ToInt("172.31.255.255")],
    [ipv4ToInt("192.168.0.0"), ipv4ToInt("192.168.255.255")],
  ];
  return ranges.some(([start, end]) => n >= start && n <= end);
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
    return true;
  }
  if (isIpv4(host) && isPrivateOrLocalIpv4(host)) {
    return true;
  }
  // Basic IPv6 local / ULA detection
  if (host.includes(":")) {
    if (
      host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:")
    ) {
      return true;
    }
  }
  return false;
}

export type EndpointValidationOptions = {
  /** Permit localhost / RFC1918 / link-local (for Ollama, LM Studio, etc.) */
  allowPrivateEndpoints?: boolean;
  /** Allowed protocols */
  allowedProtocols?: string[];
};

export function assertSafeEndpoint(
  rawUrl: string,
  options: EndpointValidationOptions = {}
): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AIError(`Invalid endpoint URL: ${rawUrl}`, {
      code: "ENDPOINT_BLOCKED",
    });
  }

  const allowed = options.allowedProtocols ?? ["http:", "https:"];
  if (!allowed.includes(url.protocol)) {
    throw new AIError(
      `Endpoint protocol "${url.protocol}" is not allowed.`,
      { code: "ENDPOINT_BLOCKED" }
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname === "169.254.169.254") {
    throw new AIError("Cloud metadata endpoints are blocked.", {
      code: "ENDPOINT_BLOCKED",
    });
  }

  const isPrivate = isLocalHostname(hostname);
  if (isPrivate && !options.allowPrivateEndpoints) {
    throw new AIError(
      `Private/local endpoint "${hostname}" is blocked. Enable allowPrivateEndpoints for local models.`,
      { code: "ENDPOINT_BLOCKED" }
    );
  }

  return url;
}

export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}
