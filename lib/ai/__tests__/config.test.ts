import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultAISettings,
  migrateAISettings,
  AISettingsSchemaV1,
} from "../config-schema";

describe("AI settings config", () => {
  it("creates a valid default settings document", () => {
    const defaults = createDefaultAISettings();
    const parsed = AISettingsSchemaV1.parse(defaults);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.defaultProviderId, "mock-local");
    assert.equal(parsed.providers[0].kind, "mock");
    assert.equal(parsed.routing.allowCloudFallback, false);
  });

  it("rejects unknown schema versions", () => {
    assert.throws(
      () => migrateAISettings({ schemaVersion: 99, providers: [] }),
      /Unsupported AI settings schemaVersion/
    );
  });

  it("rejects defaultProviderId not in providers", () => {
    assert.throws(
      () =>
        migrateAISettings({
          ...createDefaultAISettings(),
          defaultProviderId: "missing",
        }),
      /defaultProviderId/
    );
  });

  it("rejects malformed provider ids", () => {
    assert.throws(() =>
      AISettingsSchemaV1.parse({
        ...createDefaultAISettings(),
        providers: [
          {
            id: "bad id!",
            name: "Bad",
            kind: "mock",
            enabled: true,
          },
        ],
      })
    );
  });
});
