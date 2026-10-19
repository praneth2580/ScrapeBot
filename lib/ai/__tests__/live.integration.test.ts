import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Opt-in live integration checks. Skipped unless WEBPILOT_LIVE_AI_TEST=1.
 * Never runs in default `npm test`.
 */
const enabled = process.env.WEBPILOT_LIVE_AI_TEST === "1";

describe("live AI integrations (opt-in)", { skip: !enabled }, () => {
  it("can reach Ollama when configured", async () => {
    const base =
      process.env.OLLAMA_BASE_URL?.replace(/\/+$/, "") ||
      "http://127.0.0.1:11434";
    const response = await fetch(`${base}/api/version`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.ok, true);
  });
});
