import { z } from "zod";

/**
 * Domain schemas for hybrid AI execution.
 * Kept separate from provider adapters.
 */

export const LocatorCandidateSchema = z.object({
  strategy: z.enum([
    "role",
    "label",
    "placeholder",
    "text",
    "css",
    "testid",
    "href",
  ]),
  value: z.string().min(1).max(500),
  name: z.string().max(500).optional(),
});

export const BrowserActionTypeSchema = z.enum([
  "navigate",
  "click",
  "fill",
  "select",
  "check",
  "uncheck",
  "press",
  "waitFor",
  "assert",
  "scroll",
]);

/** Actions that always require explicit user confirmation */
export const CONSEQUENTIAL_ACTION_TYPES = new Set([
  "submit",
  "purchase",
  "delete",
  "changeSecurity",
]);

export const BrowserActionSchema = z.object({
  type: BrowserActionTypeSchema,
  locator: LocatorCandidateSchema.optional(),
  url: z.string().url().optional(),
  value: z.string().max(10_000).optional(),
  key: z.string().max(50).optional(),
  requiresConfirmation: z.boolean().default(false),
  /** Higher-level consequential category when known */
  consequentialKind: z
    .enum(["submit", "purchase", "delete", "changeSecurity", "none"])
    .default("none"),
  rationale: z.string().max(1000).optional(),
});

export const PostconditionSchema = z.object({
  type: z.enum([
    "urlEquals",
    "urlIncludes",
    "textPresent",
    "locatorVisible",
    "locatorHidden",
  ]),
  value: z.string().min(1).max(1000),
  locator: LocatorCandidateSchema.optional(),
});

export const ComponentClassificationSchema = z.object({
  role: z.string().min(1).max(120),
  purpose: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(1000).optional(),
  interactive: z.boolean().optional(),
});

export const UserIntentSchema = z.object({
  goal: z.string().min(1).max(500),
  target: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1),
  slots: z.record(z.string(), z.unknown()).default({}),
});

export const WorkflowPlanSchema = z.object({
  goal: z.string().min(1).max(500),
  actions: z.array(BrowserActionSchema).max(50),
  postconditions: z.array(PostconditionSchema).max(20).default([]),
});

export const InterpretResultSchema = z.object({
  summary: z.string().min(1).max(5000),
  fields: z
    .array(
      z.object({
        name: z.string(),
        required: z.boolean().optional(),
        description: z.string().optional(),
      })
    )
    .default([]),
});

export const RecoveryProposalSchema = z.object({
  reason: z.string().min(1).max(1000),
  revisedActions: z.array(BrowserActionSchema).max(50).default([]),
  abort: z.boolean().default(false),
});

export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;
export type BrowserAction = z.infer<typeof BrowserActionSchema>;
export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;
export type UserIntent = z.infer<typeof UserIntentSchema>;
export type ComponentClassification = z.infer<
  typeof ComponentClassificationSchema
>;
export type RecoveryProposal = z.infer<typeof RecoveryProposalSchema>;

/** Actions the Playwright executor may never run from model output */
export const PROHIBITED_ACTION_TYPES = new Set([
  "evaluate",
  "executeScript",
  "runShell",
  "downloadFile",
  "setCookie",
  "exposeFunction",
]);

export function assertActionsAllowed(actions: BrowserAction[]): void {
  for (const action of actions) {
    const type = String(action.type);
    if (PROHIBITED_ACTION_TYPES.has(type)) {
      throw new Error(`Prohibited browser action type: ${type}`);
    }
    // CSS locators that look like script injection vectors are rejected
    if (
      action.locator?.strategy === "css" &&
      /expression\s*\(|javascript:/i.test(action.locator.value)
    ) {
      throw new Error("Prohibited locator value.");
    }
  }
}

export function actionRequiresConfirmation(action: BrowserAction): boolean {
  if (action.requiresConfirmation) return true;
  if (
    action.consequentialKind &&
    action.consequentialKind !== "none" &&
    CONSEQUENTIAL_ACTION_TYPES.has(action.consequentialKind)
  ) {
    return true;
  }
  return false;
}

export function schemaForTask(task: string) {
  switch (task) {
    case "classify":
      return ComponentClassificationSchema;
    case "intent":
      return UserIntentSchema;
    case "plan":
      return WorkflowPlanSchema;
    case "interpret":
      return InterpretResultSchema;
    case "recover":
      return RecoveryProposalSchema;
    default:
      return undefined;
  }
}
