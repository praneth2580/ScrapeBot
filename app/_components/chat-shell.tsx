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
      <main className="h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(244,239,230,0.8)_30%,_#d6e0ea_100%)] px-6 py-8 text-slate-950">
        <div className="flex h-full items-center justify-center rounded-[2rem] border border-white/70 bg-white/65 text-lg text-slate-600 shadow-[0_30px_120px_rgba(15,23,42,0.16)] backdrop-blur">
          Loading chat workspace...
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(244,239,230,0.8)_30%,_#d6e0ea_100%)] px-6 py-8 text-slate-950">
        <div className="flex h-full items-center justify-center rounded-[2rem] border border-white/70 bg-white/65 text-lg text-rose-600 shadow-[0_30px_120px_rgba(15,23,42,0.16)] backdrop-blur">
          {error ?? "Unable to load chat workspace."}
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.9),_rgba(244,239,230,0.8)_30%,_#d6e0ea_100%)] text-slate-950">
      <div className="flex h-full w-full overflow-hidden border border-white/70 bg-white/65 shadow-[0_30px_120px_rgba(15,23,42,0.16)] backdrop-blur">
        <ChatSidebar
          activeChatId={activeChatId}
          branding={config.sidebar}
          actions={config.actions}
          sections={config.sections}
          recentChats={threads}
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
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-5 pt-6 sm:px-6">
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
