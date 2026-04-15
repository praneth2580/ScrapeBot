"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ChatComposer from "./chat/chat-composer";
import ChatHeader from "./chat/chat-header";
import ChatMessageList from "./chat/chat-message-list";
import ChatMobileIntro from "./chat/chat-mobile-intro";
import ChatSidebar from "./chat/chat-sidebar";
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
} from "./chat/types";

async function fetchJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = (await response.json()) as T | { error?: string };

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
  const [error, setError] = useState<string | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeChatId),
    [activeChatId, threads]
  );

  const messages = useMemo(() => activeThread?.messages ?? [], [activeThread]);

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

    setIsSubmitting(true);
    setError(null);

    try {
      const data = await fetchJson<ThreadResponse>(
        `/api/chat/threads/${activeChatId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: trimmed, model: selectedModel }),
        }
      );

      setThreads((current) =>
        current.map((thread) =>
          thread.id === activeChatId ? data.thread : thread
        )
      );
      await refreshThreads();
      setDraft("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to send message."
      );
    } finally {
      setIsSubmitting(false);
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

    try {
      const data = await fetchJson<CreateThreadResponse>("/api/chat/threads", {
        method: "POST",
      });
      setConfig(data.config);
      setThreads(data.threads);
      setActiveChatId(data.activeChatId);
      setIsSidebarOpen(false);
      setDraft("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create chat.");
    }
  }

  async function clearChat() {
    if (!activeChatId) {
      return;
    }

    setError(null);

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
      <main className="h-dvh w-full bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(244,239,230,0.8)_30%,_#d6e0ea_100%)] text-slate-950">
        <div className="flex h-full items-center justify-center bg-white/10 shadow-[0_30px_120px_rgba(15,23,42,0.16)] backdrop-blur">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/70 p-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                  Preparing workspace
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-900">
                  Loading Scrapebot
                </h1>
              </div>
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[var(--accent)] border-r-[var(--accent)]" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="h-3 w-32 animate-pulse rounded-full bg-slate-200" />
              <div className="h-24 animate-pulse rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(226,232,240,0.7))]" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-16 animate-pulse rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(226,232,240,0.65))]" />
                <div className="h-16 animate-pulse rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(226,232,240,0.65))]" />
              </div>
            </div>

            <p className="mt-5 text-sm text-slate-600">
              Pulling threads, model configuration, and local chat state.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="h-dvh w-full bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(244,239,230,0.8)_30%,_#d6e0ea_100%)] text-slate-950">
        <div className="flex h-full items-center justify-center bg-white/10 text-lg text-rose-600 shadow-[0_30px_120px_rgba(15,23,42,0.16)] backdrop-blur">
          {error ?? "Unable to load chat workspace."}
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh w-full bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(244,239,230,0.8)_30%,_#d6e0ea_100%)] text-slate-950">
      <div className="relative flex h-full w-full overflow-hidden bg-white/65 shadow-[0_30px_120px_rgba(15,23,42,0.16)] backdrop-blur">
        {isSidebarOpen ? (
          <div className="absolute inset-0 z-30 bg-slate-950/30 backdrop-blur-[2px] lg:hidden">
            <div className="h-full w-[min(22rem,88vw)]">
              <ChatSidebar
                activeChatId={activeChatId}
                branding={config.sidebar}
                actions={config.actions}
                sections={config.sections}
                recentChats={threads}
                className="h-full w-full border-r border-slate-200/80"
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

        <section className="flex min-w-0 flex-1 flex-col">
          <ChatHeader
            eyebrow={config.header.eyebrow}
            title={config.header.title}
            status={config.header.status}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pt-4 sm:px-6 sm:pt-6">
              <ChatMobileIntro
                badge={config.mobileIntro.badge}
                description={config.mobileIntro.description}
              />
            </div>
            {error ? (
              <div className="px-5 pt-4 text-sm text-rose-600 sm:px-6">{error}</div>
            ) : null}
            <ChatMessageList messages={messages} />
          </div>
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
        </section>
      </div>
    </main>
  );
}
