import type { ComponentClassification } from "../schemas/tasks";
import { ComponentClassificationSchema } from "../schemas/tasks";
import type { AIService } from "../service";

export type DomComponentHint = {
  tagName: string;
  role?: string | null;
  type?: string | null;
  name?: string | null;
  label?: string | null;
  text?: string | null;
  href?: string | null;
  ambiguous?: boolean;
};

/**
 * Deterministic classification for common interactive elements.
 * Returns null when the component is ambiguous and AI should be consulted.
 */
export function classifyComponentDeterministic(
  hint: DomComponentHint
): ComponentClassification | null {
  if (hint.ambiguous) return null;

  const tag = hint.tagName.toLowerCase();
  const role = (hint.role || "").toLowerCase();
  const type = (hint.type || "").toLowerCase();
  const name = hint.name || hint.label || hint.text || "";

  if (tag === "a" || role === "link") {
    return {
      role: "link",
      purpose: hint.href ? `navigate to ${hint.href}` : "navigate",
      confidence: 0.95,
      interactive: true,
      rationale: "Native anchor / link semantics",
    };
  }

  if (tag === "button" || role === "button" || type === "button" || type === "submit") {
    return {
      role: "button",
      purpose:
        type === "submit"
          ? "submit form"
          : name
            ? `activate: ${name.slice(0, 80)}`
            : "activate control",
      confidence: 0.92,
      interactive: true,
      rationale: "Native button semantics",
    };
  }

  if (tag === "input") {
    if (["text", "email", "password", "search", "tel", "url", ""].includes(type)) {
      return {
        role: "textbox",
        purpose: name ? `enter ${name}` : "enter text",
        confidence: 0.9,
        interactive: true,
        rationale: "Native text input",
      };
    }
    if (type === "checkbox") {
      return {
        role: "checkbox",
        purpose: name ? `toggle ${name}` : "toggle option",
        confidence: 0.9,
        interactive: true,
        rationale: "Native checkbox",
      };
    }
  }

  if (tag === "select" || role === "listbox") {
    return {
      role: "combobox",
      purpose: name ? `choose ${name}` : "choose option",
      confidence: 0.9,
      interactive: true,
      rationale: "Native select",
    };
  }

  if (tag === "textarea") {
    return {
      role: "textbox",
      purpose: name ? `enter ${name}` : "enter multiline text",
      confidence: 0.9,
      interactive: true,
      rationale: "Native textarea",
    };
  }

  // Custom widgets / divs with unclear roles → AI
  return null;
}

/**
 * Hybrid classification: rules first, AI only when needed.
 */
export async function classifyComponent(
  service: AIService,
  hint: DomComponentHint
): Promise<{
  classification: ComponentClassification;
  source: "deterministic" | "ai";
  providerId?: string;
}> {
  const deterministic = classifyComponentDeterministic(hint);
  if (deterministic) {
    return { classification: deterministic, source: "deterministic" };
  }

  const result = await service.runTask({
    task: "classify",
    system:
      "Classify the interactive page component. Return JSON matching the schema.",
    input: hint,
    outputSchema: ComponentClassificationSchema,
  });

  const classification = ComponentClassificationSchema.parse(result.response.data);
  return {
    classification,
    source: "ai",
    providerId: result.response.providerId,
  };
}
