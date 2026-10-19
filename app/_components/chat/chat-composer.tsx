import type { ChatUiConfig } from "./types";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent, KeyboardEvent } from "react";
import type { ChatModelOption } from "./types";

type ChatComposerProps = {
  addModelDraft: string;
  draft: string;
  quickPrompts: string[];
  composerCopy: ChatUiConfig["composer"];
  models: ChatModelOption[];
  selectedModel: string;
  disabled?: boolean;
  isAddingModel?: boolean;
  isAddModelOpen?: boolean;
  onAddModel: () => void;
  onAddModelDraftChange: (value: string) => void;
  onCloseAddModel: () => void;
  onDraftChange: (value: string) => void;
  onClearDraft: () => void;
  onModelChange: (value: string) => void;
  onOpenAddModel: () => void;
  onPromptSelect: (prompt: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const KNOWN_MODELS = [
  { name: "llama3.2", description: "Meta's lightweight model", params: "3B", ctx: "128k ctx", size: "2.0 GB" },
  { name: "qwen2.5:0.5b", description: "Extremely fast, tiny model", params: "0.5B", ctx: "32k ctx", size: "397 MB" },
  { name: "qwen2.5:7b", description: "Strong general purpose model", params: "7B", ctx: "128k ctx", size: "4.7 GB" },
  { name: "phi3:mini", description: "Microsoft's lightweight model", params: "3.8B", ctx: "4k ctx", size: "2.2 GB" },
  { name: "mistral", description: "Solid 7B model", params: "7B", ctx: "8k ctx", size: "4.1 GB" },
  { name: "llama3.1", description: "Meta's previous generation 8B", params: "8B", ctx: "128k ctx", size: "4.7 GB" },
  { name: "gemma2:2b", description: "Google's lightweight model", params: "2B", ctx: "8k ctx", size: "1.6 GB" },
  { name: "gemma2:9b", description: "Google's strong mid-size model", params: "9B", ctx: "8k ctx", size: "5.5 GB" },
  { name: "deepseek-coder-v2", description: "Strong coding model", params: "16B", ctx: "32k ctx", size: "8.9 GB" },
  { name: "nomic-embed-text", description: "Embedding model", params: "137M", ctx: "8k ctx", size: "274 MB" },
];

export default function ChatComposer({
  addModelDraft,
  draft,
  quickPrompts,
  composerCopy,
  models,
  selectedModel,
  disabled = false,
  isAddingModel = false,
  isAddModelOpen = false,
  onAddModel,
  onAddModelDraftChange,
  onCloseAddModel,
  onDraftChange,
  onClearDraft,
  onModelChange,
  onOpenAddModel,
  onPromptSelect,
  onSubmit,
}: ChatComposerProps) {
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [isAllModelsModalOpen, setIsAllModelsModalOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const activeModel = useMemo(
    () => models.find((model) => model.value === selectedModel) ?? models[0],
    [models, selectedModel]
  );

  const uninstalledModels = KNOWN_MODELS.filter(
    (km) => !models.some((m) => m.value === km.name)
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    if (!isModelPickerOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (
        modelPickerRef.current &&
        !modelPickerRef.current.contains(event.target as Node)
      ) {
        setIsModelPickerOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isModelPickerOpen]);

  function formatContextWindow(contextWindow?: number | null) {
    if (!contextWindow) return "Ctx unknown";
    if (contextWindow >= 1000) {
      return `${Math.round(contextWindow / 100) / 10}k ctx`;
    }
    return `${contextWindow} ctx`;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && !isAddingModel && draft.trim()) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  return (
    <div className="relative z-20 shrink-0 border-t border-slate-200 bg-[#eef1f4] px-4 py-3 dark:border-slate-700 dark:bg-slate-950 sm:px-6 sm:py-4">
      {isAllModelsModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:p-6">
              <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800 sm:px-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Model Library
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Select a local model to pull via Ollama.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAllModelsModalOpen(false)}
                    className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="no-scrollbar flex-1 overflow-y-auto p-5 sm:p-6">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {uninstalledModels.map((km) => (
                      <button
                        key={km.name}
                        type="button"
                        disabled={disabled || isAddingModel}
                        onClick={() => {
                          onAddModelDraftChange(km.name);
                          setIsAllModelsModalOpen(false);
                        }}
                        className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-[var(--accent)] hover:bg-white hover:shadow-md dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:hover:shadow-none"
                      >
                        <div>
                          <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {km.name}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {km.description}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium dark:border-slate-600 dark:bg-slate-900">
                            {km.params}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium dark:border-slate-600 dark:bg-slate-900">
                            {km.ctx}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium dark:border-slate-600 dark:bg-slate-900">
                            {km.size}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {isAddModelOpen && !isAllModelsModalOpen ? (
        <div className="absolute bottom-[calc(100%+0.75rem)] left-4 right-4 z-20 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-800 dark:shadow-[0_24px_80px_rgba(0,0,0,0.4)] sm:left-auto sm:right-6 sm:mx-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Add Ollama model
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Pull a local model by name, like `llama3.1` or `qwen2.5:7b`.
              </p>
            </div>
            <button
              type="button"
              disabled={isAddingModel}
              onClick={onCloseAddModel}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="add-model"
              value={addModelDraft}
              disabled={disabled || isAddingModel}
              onChange={(event) => onAddModelDraftChange(event.target.value)}
              placeholder="llama3.1 or qwen2.5:7b"
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              disabled={disabled || isAddingModel || !addModelDraft.trim()}
              onClick={onAddModel}
              className="rounded-full bg-slate-950 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {isAddingModel ? "Pulling..." : "Add"}
            </button>
          </div>

          {uninstalledModels.length > 0 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Popular options
              </p>
              <div className="no-scrollbar flex max-h-[14rem] flex-col gap-2 overflow-y-auto pr-1">
                {uninstalledModels.slice(0, 3).map((km) => (
                  <button
                    key={km.name}
                    type="button"
                    disabled={disabled || isAddingModel}
                    onClick={() => onAddModelDraftChange(km.name)}
                    className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-700"
                  >
                    <div>
                      <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                        {km.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                        {km.description}
                      </span>
                    </div>
                  </button>
                ))}
                {uninstalledModels.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setIsAllModelsModalOpen(true)}
                    className="mt-1 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400"
                  >
                    Show {uninstalledModels.length - 3} more models...
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="w-full space-y-2.5">
        {quickPrompts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={disabled}
                onClick={() => onPromptSelect(prompt)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5 dark:border-slate-600 dark:bg-slate-800 dark:focus-within:border-slate-500 dark:focus-within:ring-white/5">
          <label htmlFor="chat-draft" className="sr-only">
            {composerCopy.label}
          </label>
          <textarea
            ref={textareaRef}
            id="chat-draft"
            value={draft}
            disabled={disabled}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={composerCopy.placeholder}
            className="max-h-40 min-h-[44px] w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-100 dark:placeholder:text-slate-500"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            <div ref={modelPickerRef} className="relative min-w-0">
              <button
                id="chat-model"
                type="button"
                disabled={disabled || isAddingModel || models.length === 0}
                onClick={() => setIsModelPickerOpen((open) => !open)}
                className="flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:bg-slate-900"
              >
                <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {activeModel?.name ?? "Select model"}
                </span>
                <span className="hidden truncate text-[11px] text-slate-500 sm:inline dark:text-slate-400">
                  {[
                    activeModel?.version && `v${activeModel.version}`,
                    activeModel?.parameterSize,
                    formatContextWindow(activeModel?.contextWindow),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition ${
                    isModelPickerOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="m5 7 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isModelPickerOpen ? (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-30 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  <div className="no-scrollbar max-h-72 overflow-y-auto p-2">
                    {models.map((model) => {
                      const isActive = model.value === selectedModel;
                      return (
                        <button
                          key={model.value}
                          type="button"
                          onClick={() => {
                            onModelChange(model.value);
                            setIsModelPickerOpen(false);
                          }}
                          className={`flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition ${
                            isActive
                              ? "bg-[rgba(201,115,66,0.12)] dark:bg-[rgba(224,146,79,0.15)]"
                              : "hover:bg-slate-50 dark:hover:bg-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {model.name}
                            </p>
                            {isActive ? (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-strong)]">
                                Active
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {[
                              `v${model.version}`,
                              model.parameterSize,
                              formatContextWindow(model.contextWindow),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={disabled || isAddingModel}
                onClick={onOpenAddModel}
                className="rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Add model
              </button>
              <button
                type="button"
                disabled={disabled || isAddingModel || !draft}
                onClick={onClearDraft}
                className="rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {composerCopy.clearDraftLabel}
              </button>
              <button
                type="submit"
                disabled={disabled || isAddingModel || !draft.trim()}
                className="rounded-xl bg-slate-950 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:disabled:bg-slate-600 dark:disabled:text-slate-400"
              >
                {disabled ? composerCopy.loadingLabel : composerCopy.sendLabel}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </div>
  );
}
