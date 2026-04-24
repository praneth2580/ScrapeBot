import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ollama, resolveAvailableOllamaModel, type OllamaMessage } from "./ollama";
import { agentFunctions, ollamaTools } from "./tools";
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

  const ollamaMessages: OllamaMessage[] = [
    {
      role: "system",
      content: "You are a helpful AI web scraping assistant. When the user asks you to scrape or extract data from a website, you MUST use the 'scrapePage' tool, providing both the URL and a specific prompt describing what data to extract (e.g. 'Extract all table data'). After you receive the result from the tool, present it to the user and STOP.",
    },
    ...messages.map((message) => ({
      role: message.role as any,
      content: message.text,
    }))
  ];

  console.log("message", ollamaMessages)

  const MAX_STEPS = 5;
  let step = 0;
  let lastToolCallKey = "";

  console.log(`\n--- [Agent] New Request Started ---`);
  console.log(`[Agent] Model resolved: ${resolvedModel}`);
  console.log(`[Agent] Initial messages count: ${messages.length}`);

  while (step < MAX_STEPS) {
    step++;
    const isLastStep = step === MAX_STEPS;
    console.log(`[Agent] >> Step ${step}/${MAX_STEPS}${isLastStep ? " (final — no tools)" : ""}`);
    console.log(`[Agent] Sending chat request with ${ollamaMessages.length} messages in history...`);

    const startTime = Date.now();
    const response = await ollama.chat({
      model: resolvedModel,
      messages: ollamaMessages,
      // On the last step, omit tools to force the model to produce a text answer
      tools: isLastStep ? undefined : ollamaTools,
      stream: false,
    });
    console.log(`[Agent] Received response in ${Date.now() - startTime}ms.`);

    const responseMessage = response.message;

    // Collect tool calls from the proper field OR parse them from content text
    let toolCalls = responseMessage.tool_calls ?? [];

    // Fallback: some models (e.g. llama3.2) dump tool calls as JSON text in content
    if (!isLastStep && toolCalls.length === 0 && responseMessage.content) {
      const parsed = tryParseToolCallFromText(responseMessage.content);
      if (parsed) {
        console.log(`[Agent] Fallback: Successfully parsed tool call "${parsed.function.name}" from text content.`);
        toolCalls = [parsed];
        // Clear the content since it was actually a tool call, not a real answer
        responseMessage.content = "";
      } else {
        console.log(`[Agent] No tool calls detected in this step.`);
      }
    } else if (toolCalls.length > 0) {
      console.log(`[Agent] Detected ${toolCalls.length} tool call(s) from model response.`);
    }

    // Append the assistant message to history
    ollamaMessages.push(responseMessage);

    // If there are tool calls, execute them
    if (toolCalls.length > 0) {
      // Detect repeated identical tool calls to prevent infinite loops
      const currentToolCallKey = JSON.stringify(
        toolCalls.map((tc: any) => ({ name: tc.function.name, args: tc.function.arguments }))
      );
      if (currentToolCallKey === lastToolCallKey) {
        console.log("[Agent] Detected repeated identical tool call — forcing final answer");
        // Re-send without tools to force a text answer
        const finalResponse = await ollama.chat({
          model: resolvedModel,
          messages: ollamaMessages,
          stream: false,
        });
        const finalText = finalResponse.message.content?.trim();
        if (finalText) {
          return finalText;
        }
        throw new Error("Ollama returned an empty response after repeated tool calls.");
      }
      lastToolCallKey = currentToolCallKey;

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = toolCall.function.arguments;

        console.log(`[Agent] >> Executing tool: "${functionName}" with args:`, functionArgs);
        const toolStartTime = Date.now();

        let functionResult = "";
        try {
          if (agentFunctions[functionName as keyof typeof agentFunctions]) {
            functionResult = await (agentFunctions as any)[functionName](functionArgs);
          } else {
            functionResult = `Error: Tool "${functionName}" not found`;
          }
        } catch (err) {
          functionResult = `Error executing tool: ${err}`;
        }

        const duration = Date.now() - toolStartTime;
        const resultString = typeof functionResult === "string" ? functionResult : JSON.stringify(functionResult);
        const resultPreview = resultString.length > 150 ? resultString.slice(0, 150) + "... [truncated]" : resultString;

        console.log(`[Agent] << Tool "${functionName}" completed in ${duration}ms. Preview: ${resultPreview}`);

        ollamaMessages.push({
          role: "tool",
          content: resultString,
        });
      }
      continue;
    }

    // No tool calls — this is the final text answer
    const text = responseMessage.content?.trim();
    if (!text) {
      throw new Error("Ollama returned an empty response.");
    }

    console.log(`[Agent] Final text answer generated (${text.length} chars).`);
    console.log(`--- [Agent] Request Completed ---\n`);
    return text;
  }

  throw new Error("Agent reached maximum steps without answering.");
}

/**
 * Some models don't use the tool_calls field properly — they write the
 * tool invocation as JSON inside the content string instead.
 * This function detects and normalizes that into a proper tool call object.
 */
function tryParseToolCallFromText(text: string) {
  // Extract the first JSON-like block from the text to ignore tokens like <|im_start|>
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[0]);

    // Format: {"name": "funcName", "arguments": {...}}
    if (parsed.name && typeof parsed.name === "string" && parsed.name in agentFunctions) {
      return {
        function: {
          name: parsed.name,
          arguments: parsed.arguments ?? {},
        },
      };
    }

    // Format: {"function": {"name": "funcName", "arguments": {...}}}
    if (parsed.function?.name && typeof parsed.function.name === "string" && parsed.function.name in agentFunctions) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
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

export async function generateReply(threadId: number, model?: string) {
  const instance = ensureDb();
  const thread = getThread(threadId);

  if (!thread) {
    return null;
  }

  const assistantText = await generateAssistantReply(thread.messages, model);

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
