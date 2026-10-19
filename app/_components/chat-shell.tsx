"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ChatComposer from "./chat/chat-composer";
import ChatHeader from "./chat/chat-header";
import ChatMessageList from "./chat/chat-message-list";
import ChatMobileIntro from "./chat/chat-mobile-intro";
import ChatSidebar from "./chat/chat-sidebar";
import ChatUrlPrompt from "./chat/chat-url-prompt";
import type {
  AddChatModelRequest,
  ChatShellData,
  ChatModelsResponse,
  ChatModelOption,
  ChatThread,
  ThreadsResponse,
  ChatUiConfig,
  CreateThreadResponse,
  ThreadResponse,
  ParsePageRequest,
} from "./chat/types";

async function fetchJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const raw = await response.text();
  let payload: T | { error?: string } | null = null;

  if (raw) {
    try {
      payload = JSON.parse(raw) as T | { error?: string };
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      throw new Error("Server returned an invalid JSON response.");
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  if (payload === null) {
    throw new Error("Server returned an empty response.");
  }

  return payload as T;
}

export default function ChatShell() {
  const [config, setConfig] = useState<ChatUiConfig | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddModelOpen, setIsAddModelOpen] = useState(false);
  const [addModelDraft, setAddModelDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [models, setModels] = useState<ChatModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyStatus, setReplyStatus] = useState<{
    label: string;
    detail?: string | null;
    step: number;
    maxSteps: number;
  } | null>(null);
  const [isParsingPage, setIsParsingPage] = useState(false);
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  /** Thread ids where the user skipped the URL prompt */
  const [skippedUrlPromptIds, setSkippedUrlPromptIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeChatId),
    [activeChatId, threads]
  );

  const messages = useMemo(() => activeThread?.messages ?? [], [activeThread]);

  const showUrlPrompt = useMemo(() => {
    if (!activeChatId || messages.length > 0) return false;
    return !skippedUrlPromptIds.includes(activeChatId);
  }, [activeChatId, messages.length, skippedUrlPromptIds]);

  // Sync dark class on <html> and persist preference
  useEffect(() => {
    const stored = localStorage.getItem("scrapebot-theme");
    if (stored === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else if (stored === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("scrapebot-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("scrapebot-theme", "light");
      }
      return next;
    });
  }, []);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const [data, modelData] = await Promise.all([
          fetchJson<ChatShellData>("/api/chat"),
          fetchJson<ChatModelsResponse>("/api/chat/models"),
        ]);

        setConfig(data.config);
        setThreads(data.threads);
        setActiveChatId(data.threads[0]?.id ?? 0);
        applyModelData(modelData);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Unable to load chat workspace."
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, []);

  useEffect(() => {
    if (!threads.length) {
      setActiveChatId(0);
      return;
    }

    const activeExists = threads.some((thread) => thread.id === activeChatId);
    if (!activeExists) {
      setActiveChatId(threads[0].id);
    }
  }, [activeChatId, threads]);

  async function refreshThreads() {
    const data = await fetchJson<ThreadsResponse>("/api/chat/threads");
    setThreads(data.threads);
  }

  function applyModelData(modelData: ChatModelsResponse) {
    setModels(modelData.models);
    setSelectedModel(
      modelData.models.some((model) => model.value === modelData.defaultModel)
        ? modelData.defaultModel
        : (modelData.models[0]?.value ?? modelData.defaultModel)
    );
  }

  async function refreshThread(threadId: number) {
    const data = await fetchJson<ThreadResponse>(`/api/chat/threads/${threadId}`);
    setThreads((current) =>
      current.map((thread) => (thread.id === threadId ? data.thread : thread))
    );
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = draft.trim();
    if (!trimmed || !activeChatId) {
      return;
    }

    // Optimistically add the user message to the UI immediately
    const optimisticUserMessage = {
      id: Date.now(),
      role: "user" as const,
      text: trimmed,
    };

    setThreads((current) =>
      current.map((thread) =>
        thread.id === activeChatId
          ? {
              ...thread,
              messages: [...thread.messages, optimisticUserMessage],
              preview: trimmed.slice(0, 56),
              updatedAt: "Just now",
            }
          : thread
      )
    );
    setDraft("");
    setIsSubmitting(true);
    setReplyStatus({
      label: "Sending message",
      detail: "Waiting for the assistant…",
      step: 0,
      maxSteps: 5,
    });
    setError(null);

    try {
      const response = await fetch(`/api/chat/threads/${activeChatId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: trimmed, model: selectedModel }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error || `Request failed with status ${response.status}`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completedThread: ChatThread | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((entry) => entry.startsWith("data: "));
          if (!line) continue;

          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            step?: number;
            maxSteps?: number;
            label?: string;
            detail?: string;
            error?: string;
            thread?: ChatThread;
          };

          if (payload.type === "status") {
            setReplyStatus({
              label: payload.label || "Working…",
              detail: payload.detail ?? null,
              step: payload.step ?? 0,
              maxSteps: payload.maxSteps ?? 5,
            });
          } else if (payload.type === "done" && payload.thread) {
            completedThread = payload.thread;
          } else if (payload.type === "error") {
            throw new Error(payload.error || "Unable to send message.");
          }
        }
      }

      if (!completedThread) {
        throw new Error("Assistant closed the connection without a reply.");
      }

      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeChatId ? completedThread! : thread
        )
      );
      await refreshThreads();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to send message."
      );
    } finally {
      setIsSubmitting(false);
      setReplyStatus(null);
    }
  }

  async function addModel() {
    const trimmed = addModelDraft.trim();
    if (!trimmed) {
      return;
    }

    setError(null);
    setIsAddingModel(true);

    try {
      const modelData = await fetchJson<ChatModelsResponse>("/api/chat/models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: trimmed } satisfies AddChatModelRequest),
      });

      applyModelData(modelData);
      setAddModelDraft("");
      setIsAddModelOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to add model.");
    } finally {
      setIsAddingModel(false);
    }
  }

  async function startNewChat() {
    setError(null);
    setParseError(null);

    try {
      const data = await fetchJson<CreateThreadResponse>("/api/chat/threads", {
        method: "POST",
      });
      setConfig(data.config);
      setThreads(data.threads);
      setActiveChatId(data.activeChatId);
      setSkippedUrlPromptIds((current) =>
        current.filter((id) => id !== data.activeChatId)
      );
      setIsSidebarOpen(false);
      setDraft("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create chat.");
    }
  }

  async function parsePageForActiveChat(url: string, focus?: string) {
    if (!activeChatId) return;

    setIsParsingPage(true);
    setParseStatus("Opening page in headless browser…");
    setParseError(null);
    setError(null);

    // Timed status hints while Playwright scrapes (no streaming on parse yet).
    const timers = [
      window.setTimeout(
        () => setParseStatus("Extracting readable content…"),
        2500
      ),
      window.setTimeout(
        () => setParseStatus("Saving page context for this chat…"),
        7000
      ),
    ];

    try {
      const data = await fetchJson<ThreadResponse>(
        `/api/chat/threads/${activeChatId}/parse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, focus } satisfies ParsePageRequest),
        }
      );

      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeChatId ? data.thread : thread
        )
      );
      await refreshThreads();
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : "Unable to parse the page."
      );
    } finally {
      for (const timer of timers) window.clearTimeout(timer);
      setIsParsingPage(false);
      setParseStatus(null);
    }
  }

  function skipUrlPrompt() {
    if (!activeChatId) return;
    setParseError(null);
    setSkippedUrlPromptIds((current) =>
      current.includes(activeChatId) ? current : [...current, activeChatId]
    );
  }

  async function clearChat() {
    if (!activeChatId) {
      return;
    }

    setError(null);
    setParseError(null);

    try {
      const data = await fetchJson<ThreadResponse>(
        `/api/chat/threads/${activeChatId}/clear`,
        { method: "POST" }
      );
      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeChatId ? data.thread : thread
        )
      );
      // After clear, ask for a page URL again
      setSkippedUrlPromptIds((current) =>
        current.filter((id) => id !== activeChatId)
      );
      await refreshThreads();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to clear chat.");
    }
  }

  function clearDraft() {
    setDraft("");
  }

  async function selectChat(threadId: number) {
    setActiveChatId(threadId);
    setIsSidebarOpen(false);
    setError(null);

    try {
      await refreshThread(threadId);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to open chat thread."
      );
    }
  }

  async function deleteChat(threadId: number) {
    setError(null);

    try {
      const data = await fetchJson<ThreadsResponse>(`/api/chat/threads/${threadId}`, {
        method: "DELETE",
      });

      setThreads(data.threads);

      if (threadId === activeChatId) {
        setActiveChatId(data.threads[0]?.id ?? 0);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete chat.");
    }
  }

  if (isLoading) {
    return (
      <main className="flex h-[100dvh] w-full items-center justify-center bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                Preparing workspace
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Loading Scrapebot
              </h1>
            </div>
            <div className="relative h-11 w-11">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-700" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[var(--accent)] border-r-[var(--accent)]" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          </div>
          <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
            Pulling threads, model configuration, and local chat state.
          </p>
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="flex h-[100dvh] w-full items-center justify-center bg-slate-100 px-6 text-center text-lg text-rose-600 dark:bg-slate-950 dark:text-rose-400">
        {error ?? "Unable to load chat workspace."}
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] w-full overflow-hidden bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-white dark:bg-slate-900">
        {isSidebarOpen ? (
          <div className="absolute inset-0 z-30 bg-slate-950/35 backdrop-blur-[2px] lg:hidden dark:bg-black/50">
            <div className="h-full w-[min(20rem,88vw)] shadow-2xl">
              <ChatSidebar
                activeChatId={activeChatId}
                branding={config.sidebar}
                actions={config.actions}
                sections={config.sections}
                recentChats={threads}
                className="flex h-full w-full"
                onClearChat={clearChat}
                onClearDraft={clearDraft}
                onDeleteChat={deleteChat}
                onNewChat={startNewChat}
                onRequestClose={() => setIsSidebarOpen(false)}
                onSelectChat={selectChat}
              />
            </div>
            <button
              type="button"
              aria-label="Close chats"
              onClick={() => setIsSidebarOpen(false)}
              className="absolute inset-0 -z-10"
            />
          </div>
        ) : null}

        <ChatSidebar
          activeChatId={activeChatId}
          branding={config.sidebar}
          actions={config.actions}
          sections={config.sections}
          recentChats={threads}
          className="hidden lg:flex"
          onClearChat={clearChat}
          onClearDraft={clearDraft}
          onDeleteChat={deleteChat}
          onNewChat={startNewChat}
          onSelectChat={selectChat}
        />

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f6f8] dark:bg-slate-900">
          <ChatHeader
            eyebrow={config.header.eyebrow}
            title={config.header.title}
            status={config.header.status}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!showUrlPrompt ? (
              <div className="shrink-0 px-4 pt-3 sm:px-6 lg:hidden">
                <ChatMobileIntro
                  badge={config.mobileIntro.badge}
                  description={config.mobileIntro.description}
                />
              </div>
            ) : null}

            {error ? (
              <div className="w-full shrink-0 px-4 pt-3 text-sm text-rose-600 dark:text-rose-400 sm:px-6 lg:px-8">
                {error}
              </div>
            ) : null}

            {showUrlPrompt ? (
              <ChatUrlPrompt
                disabled={isParsingPage || !activeChatId}
                error={parseError}
                status={parseStatus}
                onParse={parsePageForActiveChat}
                onSkip={skipUrlPrompt}
              />
            ) : (
              <ChatMessageList
                messages={messages}
                thinking={
                  isSubmitting && replyStatus
                    ? {
                        label: replyStatus.label,
                        detail: replyStatus.detail,
                        step: replyStatus.step,
                        maxSteps: replyStatus.maxSteps,
                      }
                    : isSubmitting
                      ? {
                          label: "Working…",
                          detail: "Waiting on the local model",
                          step: 0,
                          maxSteps: 5,
                        }
                      : null
                }
              />
            )}
          </div>

          {!showUrlPrompt ? (
            <ChatComposer
              addModelDraft={addModelDraft}
              draft={draft}
              quickPrompts={config.quickPrompts}
              composerCopy={config.composer}
              models={models}
              selectedModel={selectedModel}
              disabled={isSubmitting}
              isAddModelOpen={isAddModelOpen}
              isAddingModel={isAddingModel}
              onAddModel={addModel}
              onAddModelDraftChange={setAddModelDraft}
              onCloseAddModel={() => setIsAddModelOpen(false)}
              onDraftChange={setDraft}
              onClearDraft={clearDraft}
              onModelChange={setSelectedModel}
              onOpenAddModel={() => setIsAddModelOpen(true)}
              onPromptSelect={setDraft}
              onSubmit={handleSendMessage}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}
