/**
 * Prompt budget for local models with about a 4k context window.
 * Roughly 2,000 input tokens: a short instruction, a page excerpt, and a few recent turns.
 */

export const LOCAL_NUM_CTX = 4096;
export const SYSTEM_CHAR_BUDGET = 400;
export const PAGE_EXCERPT_CHARS = 4_000;
export const SUMMARY_CHARS = 800;
export const CHUNK_CHARS = 800;
/** Stored page text available for retrieval. Only an excerpt is sent to the model. */
export const MAX_STORED_PAGE_CHARS = 12_000;
export const HISTORY_TURNS = 4;
export const HISTORY_MESSAGE_CHARS = 500;
export const QUESTION_CHARS = 1_000;
/** System + excerpt + history + question. */
export const BASIC_INPUT_CHAR_BUDGET = 7_000;

export const BASIC_SYSTEM_PROMPT =
  "Answer from the page excerpt when one is provided. If the excerpt does not contain the answer, say so. Be concise.";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "what",
  "when",
  "where",
  "how",
  "why",
  "are",
  "was",
  "were",
  "you",
  "your",
  "page",
  "about",
  "does",
  "did",
  "can",
  "have",
  "has",
  "into",
  "onto",
  "than",
  "then",
  "them",
  "they",
  "will",
  "just",
  "please",
  "tell",
  "which",
  "who",
]);

export type PageChunk = {
  heading: string;
  text: string;
};

export type StoredPageContext = {
  v: 1;
  title: string;
  url: string;
  outline: string;
  summary: string;
  chunks: PageChunk[];
};

export type ChatTurn = {
  role: "user" | "assistant" | string;
  text: string;
};

const PARSE_USER = /^Parse https?:\/\//i;
const PARSE_ASSISTANT = /^Parsing is done\b/;
const SUMMARY_QUESTION =
  /\b(summar(?:y|ize|ise)?|overview|tldr|tl;dr|main points|what is this (?:page|site|article)|about this page)\b/i;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function capText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars).trimEnd();
}

export function chunkMarkdown(markdown: string, chunkChars = CHUNK_CHARS): PageChunk[] {
  const text = markdown.replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  const parts = text.split(/\n(?=#{1,3} )/);
  const chunks: PageChunk[] = [];

  for (const part of parts) {
    const lines = part.split("\n");
    const first = lines[0] ?? "";
    const heading = /^#{1,3}\s+/.test(first) ? first.replace(/^#{1,3}\s+/, "").trim() : "";
    const body = (heading ? lines.slice(1).join("\n") : part).trim();
    const source = body || heading;
    if (!source) continue;

    for (let offset = 0; offset < source.length; offset += chunkChars) {
      const slice = source.slice(offset, offset + chunkChars).trim();
      if (slice) {
        chunks.push({ heading, text: slice });
      }
    }
  }

  return chunks;
}

export function buildStoredPageContext(input: {
  title: string;
  url: string;
  markdown: string;
  focus?: string;
}): StoredPageContext {
  const markdown = capText(input.markdown, MAX_STORED_PAGE_CHARS);
  const chunks = chunkMarkdown(markdown);
  const headings = [
    ...new Set(chunks.map((chunk) => chunk.heading).filter(Boolean)),
  ].slice(0, 12);
  const opening = firstParagraph(markdown);

  const outline = [
    input.title.trim() ? `Title: ${input.title.trim()}` : "",
    input.url.trim() ? `URL: ${input.url.trim()}` : "",
    input.focus?.trim() ? `Focus: ${input.focus.trim()}` : "",
    headings.length > 0 ? `Headings: ${headings.join(" | ")}` : "",
    opening ? `Opening: ${opening}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const summary = capText(outline, SUMMARY_CHARS);

  return {
    v: 1,
    title: input.title.trim() || "Untitled page",
    url: input.url.trim(),
    outline: summary,
    summary,
    chunks,
  };
}

export function serializePageContext(page: StoredPageContext): string {
  return JSON.stringify(page);
}

export function parseStoredPageContext(raw: string | null | undefined): StoredPageContext | null {
  const value = raw?.trim();
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (isStoredPageContext(parsed)) {
      return parsed;
    }
  } catch {
    // Older threads stored plain markdown.
  }

  return buildStoredPageContext({
    title: "Parsed page",
    url: "",
    markdown: value,
  });
}

export function extractHttpUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  const urls: string[] = [];

  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?]+$/, "");
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        urls.push(parsed.toString());
      }
    } catch {
      // Ignore text that only looks like a URL.
    }
  }

  return [...new Set(urls)];
}

export function urlsMatch(left: string, right: string): boolean {
  try {
    return new URL(left).toString() === new URL(right).toString();
  } catch {
    return left === right;
  }
}

export function isSummaryQuestion(question: string): boolean {
  return SUMMARY_QUESTION.test(question);
}

export function selectPageExcerpt(page: StoredPageContext, question: string): string {
  const brief = page.summary || page.outline;
  const ordered = isSummaryQuestion(question)
    ? spreadChunks(page.chunks)
    : rankChunks(page.chunks, question);

  let used = brief.length;
  const selected: PageChunk[] = [];

  for (const chunk of ordered) {
    const block = formatChunk(chunk);
    if (used + block.length + 2 > PAGE_EXCERPT_CHARS) continue;
    selected.push(chunk);
    used += block.length + 2;
    if (selected.length >= 5) break;
  }

  if (selected.length === 0 && page.chunks[0]) {
    const room = Math.max(0, PAGE_EXCERPT_CHARS - brief.length - 20);
    selected.push({
      heading: page.chunks[0].heading,
      text: capText(page.chunks[0].text, room),
    });
  }

  return capText(
    [brief, ...selected.map(formatChunk)].filter(Boolean).join("\n\n"),
    PAGE_EXCERPT_CHARS
  );
}

export function clipChatHistory(messages: ChatTurn[]): ChatTurn[] {
  const last = messages[messages.length - 1];
  const end = last?.role === "user" ? messages.length - 1 : messages.length;
  const prior = messages.slice(0, end).filter((message) => {
    const text = message.text.trim();
    if (message.role === "user" && PARSE_USER.test(text)) return false;
    if (message.role === "assistant" && PARSE_ASSISTANT.test(text)) return false;
    return true;
  });

  return prior.slice(-HISTORY_TURNS).map((message) => ({
    role: message.role,
    text:
      message.text.length > HISTORY_MESSAGE_CHARS
        ? `${message.text.slice(0, HISTORY_MESSAGE_CHARS)}…`
        : message.text,
  }));
}

export function buildChatPrompt(input: {
  excerpt?: string;
  history: ChatTurn[];
  question: string;
}): { system: string; user: string } {
  const system = capText(BASIC_SYSTEM_PROMPT, SYSTEM_CHAR_BUDGET);
  const questionBlock = `Question:\n${capText(input.question, QUESTION_CHARS)}`;
  const history = input.history.slice(-HISTORY_TURNS).map((turn) => ({
    ...turn,
    text:
      turn.text.length > HISTORY_MESSAGE_CHARS
        ? `${turn.text.slice(0, HISTORY_MESSAGE_CHARS)}…`
        : turn.text,
  }));
  const historyBlock =
    history.length > 0
      ? `Recent chat:\n${history
          .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`)
          .join("\n")}`
      : "";

  const reserved = questionBlock.length + historyBlock.length + system.length + 16;
  const excerptRoom = Math.max(0, BASIC_INPUT_CHAR_BUDGET - reserved);
  const excerpt = input.excerpt?.trim()
    ? capText(input.excerpt, Math.min(PAGE_EXCERPT_CHARS, excerptRoom))
    : "";

  const user = [
    excerpt ? `Page excerpt:\n${excerpt}` : "",
    historyBlock,
    questionBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}

function firstParagraph(markdown: string): string {
  const paragraph = markdown
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#"));
  return paragraph ? capText(paragraph.replace(/\s+/g, " "), 320) : "";
}

function formatChunk(chunk: PageChunk): string {
  return chunk.heading ? `## ${chunk.heading}\n${chunk.text}` : chunk.text;
}

function uniqueTerms(question: string): string[] {
  const tokens = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return [...new Set(tokens.filter((token) => !STOPWORDS.has(token)))];
}

function scoreChunk(chunk: PageChunk, terms: string[]): number {
  const heading = chunk.heading.toLowerCase();
  const body = chunk.text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (body.includes(term)) score += 1;
    if (heading.includes(term)) score += 2;
  }
  return score;
}

function rankChunks(chunks: PageChunk[], question: string): PageChunk[] {
  const terms = uniqueTerms(question);
  if (terms.length === 0) return spreadChunks(chunks);

  const scored = chunks.map((chunk, index) => ({
    chunk,
    index,
    score: scoreChunk(chunk, terms),
  }));
  const best = scored.reduce((max, item) => Math.max(max, item.score), 0);
  if (best <= 0) return spreadChunks(chunks);

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.chunk);
}

function spreadChunks(chunks: PageChunk[]): PageChunk[] {
  if (chunks.length <= 3) return chunks;
  const indexes = new Set<number>([
    0,
    Math.floor(chunks.length / 2),
    chunks.length - 1,
  ]);
  const step = Math.max(1, Math.floor(chunks.length / 5));
  for (let index = 0; index < chunks.length; index += step) {
    indexes.add(index);
  }
  return [...indexes].sort((a, b) => a - b).map((index) => chunks[index]!);
}

function isStoredPageContext(value: unknown): value is StoredPageContext {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StoredPageContext>;
  if (
    record.v !== 1 ||
    typeof record.summary !== "string" ||
    typeof record.outline !== "string" ||
    !Array.isArray(record.chunks)
  ) {
    return false;
  }

  return record.chunks.every(
    (chunk) =>
      !!chunk &&
      typeof chunk === "object" &&
      typeof chunk.heading === "string" &&
      typeof chunk.text === "string"
  );
}
