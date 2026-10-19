import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createMockProvider } from "../providers/mock";
import {
  extractJsonText,
  parseJsonLoose,
  validateStructuredOutput,
} from "../structured";
import { AIError, sanitizeErrorMessage } from "../errors";
import {
  assertActionsAllowed,
  WorkflowPlanSchema,
  type BrowserAction,
} from "../schemas/tasks";

describe("structured output", () => {
  it("extracts JSON from fenced markdown", () => {
    const text = 'Here you go:\n```json\n{"ok":true}\n```\n';
    assert.equal(extractJsonText(text), '{"ok":true}');
    assert.deepEqual(parseJsonLoose(text), { ok: true });
  });

  it("validates with Zod and rejects malformed payloads", () => {
    const schema = z.object({ ok: z.boolean() });
    assert.throws(
      () => validateStructuredOutput('{"ok":"nope"}', schema),
      (err: unknown) =>
        err instanceof AIError && err.code === "VALIDATION_FAILED"
    );
  });

  it("mock provider returns validated structured interpret payloads", async () => {
    const schema = z.object({
      summary: z.string(),
      fields: z.array(z.unknown()).default([]),
    });
    const provider = createMockProvider({ id: "mock" });
    const result = await provider.generate({
      task: "interpret",
      system: "interpret",
      input: { page: "x" },
      outputSchema: schema,
    });
    assert.equal(typeof (result.data as { summary?: string })?.summary, "string");
  });

  it("rejects prohibited browser actions in plans", () => {
    const actions = [
      {
        type: "evaluate",
        requiresConfirmation: false,
        consequentialKind: "none",
      },
    ] as unknown as BrowserAction[];

    assert.throws(() => assertActionsAllowed(actions), /Prohibited/);
  });

  it("accepts allowlisted actions", () => {
    const plan = WorkflowPlanSchema.parse({
      goal: "click submit",
      actions: [
        {
          type: "click",
          locator: { strategy: "role", value: "button", name: "Submit" },
          requiresConfirmation: true,
          consequentialKind: "submit",
        },
      ],
      postconditions: [],
    });
    assert.doesNotThrow(() => assertActionsAllowed(plan.actions));
  });

  it("redacts credentials from error messages", () => {
    const msg = sanitizeErrorMessage(
      "Authorization Bearer sk-abc123456789 and api_key=secretVALUE"
    );
    assert.match(msg, /REDACTED/);
    assert.equal(msg.includes("sk-abc123456789"), false);
  });
});
