import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ollama, resolveAvailableOllamaModel } from "./ollama";
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

const dbDirectory = path.join(process.cwd(), "data");
const dbPath = path.join(dbDirectory, "chat.sqlite");

let db: Database.Database | null = null;

function ensureDb() {
  if (db) {
    return db;
  }

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

  db = instance;
  return instance;
}

function getTimestampLabel() {
  return "Just now";
}

async function generateAssistantReply(messages: Message[], model?: string) {
  const resolvedModel = await resolveAvailableOllamaModel(model);
  const response = await ollama.chat({
    model: resolvedModel,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.text,
    })),
  });

  const text = response.message.content.trim();

  if (!text) {
    throw new Error("Ollama returned an empty response.");
  }

  return text;
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

export async function appendMessage(
  threadId: number,
  text: string,
  model?: string
) {
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

  const assistantText = await generateAssistantReply(
    [...thread.messages, userMessage],
    model
  );

  const assistantMessage: Message = {
    id: Date.now() + 1,
    role: "assistant",
    text: assistantText,
  };

  const nextMessages = [...thread.messages, userMessage, assistantMessage];
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
        INSERT INTO messages (id, thread_id, role, text, created_at_ms)
        VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        assistantMessage.id,
        threadId,
        assistantMessage.role,
        assistantMessage.text,
        Date.now() + 1
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
