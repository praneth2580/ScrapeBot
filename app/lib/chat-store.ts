import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ollama, resolveAvailableOllamaModel } from "./ollama";
import { scrapeUrl } from "./scraper";
import { resolveDataDir } from "./data-dir";
import { getAIService } from "@/lib/ai/service";
import {
  buildChatPrompt,
  buildStoredPageContext,
  clipChatHistory,
  extractHttpUrls,
  LOCAL_NUM_CTX,
  parseStoredPageContext,
  selectPageExcerpt,
  serializePageContext,
  urlsMatch,
  type StoredPageContext,
} from "./page-context";
import type {
  ChatShellData,
  ChatUiConfig,
  Message,
} from "../_components/chat/types";

type ThreadRow = {
  id: number;
  title: string;
  preview: string;
  updated_at_label: string;
  updated_at_ms: number;
};

type MessageRow = {
  id: number;
  role: Message["role"];
  text: string;
};

let db: Database.Database | null = null;

function ensureDb() {
  if (db) {
    return db;
  }

  const dbDirectory = resolveDataDir();
  const dbPath = path.join(dbDirectory, "chat.sqlite");
  fs.mkdirSync(dbDirectory, { recursive: true });

  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  instance.exec(`
    CREATE TABLE IF NOT EXISTS ui_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      preview TEXT NOT NULL,
      updated_at_label TEXT NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      thread_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('assistant', 'user')),
      text TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
    );
  `);

  // Parsed page content for AI context — not shown in the chat UI.
  const threadColumns = instance
    .prepare("PRAGMA table_info(threads)")
    .all() as Array<{ name: string }>;
  if (!threadColumns.some((column) => column.name === "page_context")) {
    instance.exec("ALTER TABLE threads ADD COLUMN page_context TEXT");
  }

  db = instance;
  return instance;
}

function getThreadPageContext(threadId: number): string | null {
  const instance = ensureDb();
  const row = instance
    .prepare("SELECT page_context FROM threads WHERE id = ?")
    .get(threadId) as { page_context: string | null } | undefined;
  const value = row?.page_context?.trim();
  return value ? value : null;
}

function getTimestampLabel() {
  return "Just now";
}

export type AgentProgress = {
  step: number;
  maxSteps: number;
  label: string;
  detail?: string;
};

const MAX_REPLY_STEPS = 3;

function setThreadPageContext(threadId: number, page: StoredPageContext) {
  ensureDb()
    .prepare("UPDATE threads SET page_context = ? WHERE id = ?")
    .run(serializePageContext(page), threadId);
}

async function completePlainText(
  system: string,
  user: string,
  model?: string
): Promise<{ text: string; detail: string }> {
  try {
    const ai = getAIService();
    await ai.reload();
    const settings = await ai.getSettings();
    const provider = settings.providers.find(
      (item) => item.id === settings.defaultProviderId && item.enabled
    );

    // The default install is a mock provider. Real chat uses a configured
    // provider, then Ollama when that provider is missing or fails.
    if (provider && provider.kind !== "mock") {
      const routed = await ai.runTask({
        task: "interpret",
        system,
        input: user,
        outputSchema: null,
        model: provider.kind === "ollama" ? model : undefined,
      });
      const text = routed.response.text.trim();
      if (text) {
        return {
          text,
          detail: `${provider.name} (${routed.response.model || provider.model || "default"})`,
        };
      }
    }
  } catch (error) {
    console.warn(
      "[Agent] Configured provider failed, falling back to Ollama:",
      error instanceof Error ? error.message : error
    );
  }

  const resolvedModel = await resolveAvailableOllamaModel(model);
  const response = await ollama.chat({
    model: resolvedModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    options: { num_ctx: LOCAL_NUM_CTX },
    stream: false,
  });
  const text = response.message.content?.trim();
  if (!text) {
    throw new Error("The model returned an empty response.");
  }
  return { text, detail: `Ollama ${resolvedModel}` };
}

async function generateAssistantReply(
  threadId: number,
  messages: Message[],
  model?: string,
  pageContext?: string | null,
  onProgress?: (progress: AgentProgress) => void
) {
  const report = (progress: AgentProgress) => {
    onProgress?.(progress);
    console.log(
      `[Agent] ${progress.label}${progress.detail ? ` — ${progress.detail}` : ""} (${progress.step}/${progress.maxSteps})`
    );
  };

  const question = [...messages].reverse().find((message) => message.role === "user")?.text ?? "";
  let stored = parseStoredPageContext(pageContext);
  const freshUrl = extractHttpUrls(question).find(
    (url) => !stored?.url || !urlsMatch(url, stored.url)
  );

  report({
    step: freshUrl ? 1 : 2,
    maxSteps: MAX_REPLY_STEPS,
    label: freshUrl ? "Reading page" : "Preparing context",
    detail: freshUrl ? freshUrl : stored ? "Selecting a short page excerpt" : "No page loaded",
  });

  if (freshUrl) {
    const scraped = await scrapeUrl(freshUrl);
    stored = buildStoredPageContext({
      title: scraped.title || "Untitled page",
      url: scraped.url,
      markdown: scraped.markdown,
    });
    setThreadPageContext(threadId, stored);
  }

  const excerpt = stored ? selectPageExcerpt(stored, question) : "";
  const { system, user } = buildChatPrompt({
    excerpt,
    history: clipChatHistory(messages),
    question,
  });

  report({
    step: 2,
    maxSteps: MAX_REPLY_STEPS,
    label: "Writing answer",
    detail: excerpt ? `${excerpt.length} character excerpt` : "Question only",
  });

  const started = Date.now();
  const result = await completePlainText(system, user, model);
  console.log(`[Agent] Received response in ${Date.now() - started}ms.`);

  report({
    step: MAX_REPLY_STEPS,
    maxSteps: MAX_REPLY_STEPS,
    label: "Done",
    detail: `${result.detail} · ${result.text.length} chars`,
  });

  return result.text;
}

function buildThreadMetadata(nextMessages: Message[]) {
  const firstUserMessage = nextMessages.find((message) => message.role === "user");
  const firstAssistantMessage = nextMessages.find(
    (message) => message.role === "assistant"
  );

  return {
    title: firstUserMessage?.text.slice(0, 32) || "New chat",
    preview:
      firstAssistantMessage?.text.slice(0, 56) ||
      "Start a conversation to see it here.",
    updatedAt: getTimestampLabel(),
    updatedAtMs: Date.now(),
  };
}

function getUiConfig() {
  const instance = ensureDb();
  const row = instance
    .prepare("SELECT value FROM ui_config WHERE key = ?")
    .get("chat_ui") as { value: string } | undefined;

  if (!row) {
    throw new Error('Missing "chat_ui" config row in SQLite database.');
  }

  return JSON.parse(row.value) as ChatUiConfig;
}

function listThreads() {
  const instance = ensureDb();
  const threadRows = instance
    .prepare(
      `
      SELECT id, title, preview, updated_at_label, updated_at_ms
      FROM threads
      ORDER BY updated_at_ms DESC, id DESC
      `
    )
    .all() as ThreadRow[];

  const messageRows = instance
    .prepare(
      `
      SELECT id, thread_id, role, text
      FROM messages
      ORDER BY created_at_ms ASC, id ASC
      `
    )
    .all() as Array<MessageRow & { thread_id: number }>;

  return threadRows.map((thread) => ({
    id: thread.id,
    title: thread.title,
    preview: thread.preview,
    updatedAt: thread.updated_at_label,
    messages: messageRows
      .filter((message) => message.thread_id === thread.id)
      .map(({ id, role, text }) => ({ id, role, text })),
  }));
}

export function getChatShellData(): ChatShellData {
  return {
    config: getUiConfig(),
    threads: listThreads(),
  };
}

export function createThread() {
  const instance = ensureDb();
  const newThreadId = Date.now();
  const metadata = buildThreadMetadata([]);

  instance
    .prepare(
      `
      INSERT INTO threads (id, title, preview, updated_at_label, updated_at_ms)
      VALUES (?, ?, ?, ?, ?)
      `
    )
    .run(
      newThreadId,
      metadata.title,
      metadata.preview,
      metadata.updatedAt,
      metadata.updatedAtMs
    );

  return {
    ...getChatShellData(),
    activeChatId: newThreadId,
  };
}

export function getThread(threadId: number) {
  return listThreads().find((thread) => thread.id === threadId) ?? null;
}

export function clearThread(threadId: number) {
  const instance = ensureDb();
  const existingThread = getThread(threadId);

  if (!existingThread) {
    return null;
  }

  const metadata = buildThreadMetadata([]);
  const clear = instance.transaction(() => {
    instance.prepare("DELETE FROM messages WHERE thread_id = ?").run(threadId);
    instance
      .prepare(
        `
        UPDATE threads
        SET title = ?, preview = ?, updated_at_label = ?, updated_at_ms = ?, page_context = NULL
        WHERE id = ?
        `
      )
      .run(
        metadata.title,
        metadata.preview,
        metadata.updatedAt,
        metadata.updatedAtMs,
        threadId
      );
  });

  clear();
  return getThread(threadId);
}

export function deleteThread(threadId: number) {
  const instance = ensureDb();
  const existingThread = getThread(threadId);

  if (!existingThread) {
    return null;
  }

  instance.prepare("DELETE FROM threads WHERE id = ?").run(threadId);
  return true;
}

export function saveUserMessage(threadId: number, text: string) {
  const instance = ensureDb();
  const thread = getThread(threadId);

  if (!thread) {
    return null;
  }

  const userMessage: Message = {
    id: Date.now(),
    role: "user",
    text,
  };

  const nextMessages = [...thread.messages, userMessage];
  const metadata = buildThreadMetadata(nextMessages);

  const insert = instance.transaction(() => {
    instance
      .prepare(
        `
        INSERT INTO messages (id, thread_id, role, text, created_at_ms)
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        userMessage.id,
        threadId,
        userMessage.role,
        userMessage.text,
        Date.now()
      );

    instance
      .prepare(
        `
        UPDATE threads
        SET title = ?, preview = ?, updated_at_label = ?, updated_at_ms = ?
        WHERE id = ?
        `
      )
      .run(
        metadata.title,
        metadata.preview,
        metadata.updatedAt,
        metadata.updatedAtMs,
        threadId
      );
  });

  insert();
  return getThread(threadId);
}

export async function generateReply(
  threadId: number,
  model?: string,
  onProgress?: (progress: AgentProgress) => void
) {
  const instance = ensureDb();
  const thread = getThread(threadId);

  if (!thread) {
    return null;
  }

  const assistantText = await generateAssistantReply(
    threadId,
    thread.messages,
    model,
    getThreadPageContext(threadId),
    onProgress
  );

  const assistantMessage: Message = {
    id: Date.now(),
    role: "assistant",
    text: assistantText,
  };

  const nextMessages = [...thread.messages, assistantMessage];
  const metadata = buildThreadMetadata(nextMessages);

  const insert = instance.transaction(() => {
    instance
      .prepare(
        `
        INSERT INTO messages (id, thread_id, role, text, created_at_ms)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(
        assistantMessage.id,
        threadId,
        assistantMessage.role,
        assistantMessage.text,
        Date.now()
      );

    instance
      .prepare(
        `
        UPDATE threads
        SET title = ?, preview = ?, updated_at_label = ?, updated_at_ms = ?
        WHERE id = ?
        `
      )
      .run(
        metadata.title,
        metadata.preview,
        metadata.updatedAt,
        metadata.updatedAtMs,
        threadId
      );
  });

  insert();
  return getThread(threadId);
}

function assertHttpUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Enter a valid http(s) URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }

  return parsed.toString();
}

/**
 * First step for a new chat: scrape a page and seed the thread with
 * user + assistant messages so follow-up questions have page context.
 */
export async function parsePageForThread(
  threadId: number,
  rawUrl: string,
  focus?: string
) {
  const instance = ensureDb();
  const thread = getThread(threadId);

  if (!thread) {
    return null;
  }

  if (thread.messages.length > 0) {
    throw new Error("This chat already has messages. Start a new chat to parse a page.");
  }

  const url = assertHttpUrl(rawUrl.trim());
  const scraped = await scrapeUrl(url);
  const pageContext = serializePageContext(
    buildStoredPageContext({
      title: scraped.title || "Untitled page",
      url: scraped.url,
      markdown: scraped.markdown || "(No readable content extracted.)",
      focus: focus?.trim(),
    })
  );

  const userText = focus?.trim()
    ? `Parse ${url}\nFocus: ${focus.trim()}`
    : `Parse ${url}`;

  const host = new URL(scraped.url).hostname;
  const title = scraped.title || host;
  const assistantText = focus?.trim()
    ? `Parsing is done for “${title}”. Ready for questions about ${focus.trim()}.`
    : `Parsing is done for “${title}”.`;

  const now = Date.now();
  const userMessage: Message = {
    id: now,
    role: "user",
    text: userText,
  };
  const assistantMessage: Message = {
    id: now + 1,
    role: "assistant",
    text: assistantText,
  };

  const threadTitle = title.slice(0, 48);
  const preview = `Parsed ${host}`.slice(0, 56);
  const updatedAt = getTimestampLabel();
  const updatedAtMs = Date.now();

  const insert = instance.transaction(() => {
    instance
      .prepare(
        `
        INSERT INTO messages (id, thread_id, role, text, created_at_ms)
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(userMessage.id, threadId, userMessage.role, userMessage.text, now);

    instance
      .prepare(
        `
        INSERT INTO messages (id, thread_id, role, text, created_at_ms)
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        assistantMessage.id,
        threadId,
        assistantMessage.role,
        assistantMessage.text,
        now + 1
      );

    instance
      .prepare(
        `
        UPDATE threads
        SET title = ?, preview = ?, updated_at_label = ?, updated_at_ms = ?, page_context = ?
        WHERE id = ?
        `
      )
      .run(threadTitle, preview, updatedAt, updatedAtMs, pageContext, threadId);
  });

  insert();
  return getThread(threadId);
}
