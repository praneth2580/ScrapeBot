import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BASIC_INPUT_CHAR_BUDGET,
  BASIC_SYSTEM_PROMPT,
  CHUNK_CHARS,
  PAGE_EXCERPT_CHARS,
  SYSTEM_CHAR_BUDGET,
  buildChatPrompt,
  buildStoredPageContext,
  clipChatHistory,
  extractHttpUrls,
  parseStoredPageContext,
  selectPageExcerpt,
  serializePageContext,
} from "../page-context";

function samplePage() {
  const sections = [
    "# Intro\n\nThis article explains local model limits.",
    "# Pricing\n\nThe widget costs 42 dollars per month.",
    "# Shipping\n\nOrders ship from Lisbon in two days.",
    "# FAQ\n\nRefunds are available for 30 days.",
  ];
  return sections.join("\n\n");
}

describe("page context budget", () => {
  it("keeps the system instruction inside the small-model budget", () => {
    assert.ok(BASIC_SYSTEM_PROMPT.length <= SYSTEM_CHAR_BUDGET);
  });

  it("splits markdown on headings into short chunks", () => {
    const page = buildStoredPageContext({
      title: "Catalog",
      url: "https://example.com/catalog",
      markdown: samplePage(),
    });

    assert.equal(page.v, 1);
    assert.ok(page.chunks.length >= 4);
    assert.ok(page.chunks.every((chunk) => chunk.text.length <= CHUNK_CHARS));
    assert.ok(page.summary.length <= 800);
    assert.match(page.summary, /Pricing/);
  });

  it("retrieves the chunk that matches the question", () => {
    const page = buildStoredPageContext({
      title: "Catalog",
      url: "https://example.com/catalog",
      markdown: samplePage(),
    });
    const excerpt = selectPageExcerpt(page, "What is the widget price?");

    assert.match(excerpt, /42 dollars/);
    assert.ok(excerpt.length <= PAGE_EXCERPT_CHARS);
    assert.equal(excerpt.startsWith("## Shipping"), false);
  });

  it("builds a prompt that stays inside the basic input budget", () => {
    const long = Array.from({ length: 20 }, (_, index) => {
      const token = index === 15 ? "uniquezeta" : "filler";
      return `# Section ${index}\n\n${token} ${"word ".repeat(40)}`;
    }).join("\n\n");
    const page = buildStoredPageContext({
      title: "Long",
      url: "https://example.com/long",
      markdown: long,
    });
    const prompt = buildChatPrompt({
      excerpt: selectPageExcerpt(page, "Where is uniquezeta mentioned?"),
      history: [
        { role: "user", text: "Earlier question ".repeat(80) },
        { role: "assistant", text: "Earlier answer ".repeat(80) },
        { role: "user", text: "Parse https://example.com/long" },
        { role: "assistant", text: "Parsing is done for “Long”." },
      ],
      question: "Where is uniquezeta mentioned?",
    });

    assert.match(prompt.user, /uniquezeta/);
    assert.ok(prompt.system.length + prompt.user.length <= BASIC_INPUT_CHAR_BUDGET);
  });

  it("drops parse confirmations and keeps only recent turns", () => {
    const history = clipChatHistory([
      { role: "user", text: "Parse https://example.com" },
      { role: "assistant", text: "Parsing is done for “Example”." },
      { role: "user", text: "First" },
      { role: "assistant", text: "A" },
      { role: "user", text: "Second" },
      { role: "assistant", text: "B" },
      { role: "user", text: "Third" },
      { role: "assistant", text: "C" },
      { role: "user", text: "What is the price?" },
    ]);

    assert.deepEqual(
      history.map((turn) => turn.text),
      ["Second", "B", "Third", "C"]
    );
  });

  it("reads older plain-text page context", () => {
    const page = parseStoredPageContext(
      "Title: Legacy\n\n# Pricing\n\nThe legacy plan is 9 dollars."
    );
    assert.ok(page);
    const excerpt = selectPageExcerpt(page, "legacy plan cost");
    assert.match(excerpt, /9 dollars/);
  });

  it("round-trips stored JSON context", () => {
    const page = buildStoredPageContext({
      title: "Catalog",
      url: "https://example.com",
      markdown: samplePage(),
      focus: "pricing",
    });
    const restored = parseStoredPageContext(serializePageContext(page));
    assert.equal(restored?.url, "https://example.com");
    assert.match(restored?.summary ?? "", /pricing/);
  });

  it("extracts http urls from a question", () => {
    assert.deepEqual(extractHttpUrls("Please read https://example.com/docs, thanks."), [
      "https://example.com/docs",
    ]);
  });
});
