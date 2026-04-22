import type { ChatUiConfig } from "./types";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { FormEvent } from "react";
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

  const activeModel = useMemo(
    () => models.find((model) => model.value === selectedModel) ?? models[0],
    [models, selectedModel]
  );

  function formatContextWindow(contextWindow?: number | null) {
    if (!contextWindow) {
      return "Ctx unknown";
    }

    if (contextWindow >= 1000) {
      return `${Math.round(contextWindow / 100) / 10}k ctx`;
    }

    return `${contextWindow} ctx`;
  }

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

    const uninstalledModels = KNOWN_MODELS.filter(
      (km) => !models.some((m) => m.value === km.name)
    );

    return (
      <div className="relative border-t border-slate-200/80 dark:border-slate-700/60 bg-white/75 dark:bg-slate-800/75 px-4 py-2.5 backdrop-blur sm:px-5">
        {isAllModelsModalOpen ? createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 sm:p-6">
            <div className="w-full max-w-3xl max-h-[85vh] rounded-[2rem] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-5 sm:px-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Model Library</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Select a local model to pull via Ollama.</p>
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
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 no-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {uninstalledModels.map((km) => (
                    <button
                      key={km.name}
                      type="button"
                      disabled={disabled || isAddingModel}
                      onClick={() => {
                        onAddModelDraftChange(km.name);
                        setIsAllModelsModalOpen(false);
                      }}
                      className="flex flex-col gap-3 w-full rounded-[1.25rem] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 px-4 py-4 text-left transition hover:border-[var(--accent)] dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md dark:hover:shadow-none"
                    >
                      <div>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{km.name}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">{km.description}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2.5 py-0.5 bg-white dark:bg-slate-900 font-medium">{km.params}</span>
                        <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2.5 py-0.5 bg-white dark:bg-slate-900 font-medium">{km.ctx}</span>
                        <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2.5 py-0.5 bg-white dark:bg-slate-900 font-medium">{km.size}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

        {isAddModelOpen && !isAllModelsModalOpen ? (
          <div className="absolute bottom-[calc(100%+0.75rem)] left-0 right-0 z-20 mx-auto w-[calc(100vw-2rem)] max-w-sm rounded-[1.5rem] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.4)] sm:left-auto sm:right-5 sm:mx-0 sm:w-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add Ollama model</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Pull a local model by name, like `llama3.1` or `qwen2.5:7b`.
                </p>
              </div>
              <button
                type="button"
                disabled={isAddingModel}
                onClick={onCloseAddModel}
                className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="min-w-0 flex-1 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                disabled={disabled || isAddingModel || !addModelDraft.trim()}
                onClick={onAddModel}
                className="rounded-full border border-slate-200 dark:border-slate-600 bg-slate-950 dark:bg-slate-100 px-3.5 py-2 text-xs font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-300 disabled:cursor-not-allowed disabled:border-slate-200 dark:disabled:border-slate-600 disabled:bg-slate-400 dark:disabled:bg-slate-600"
              >
                {isAddingModel ? "Pulling..." : "Add"}
              </button>
            </div>

            {uninstalledModels.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Popular options</p>
                <div className="flex flex-col gap-2 max-h-[14rem] overflow-y-auto no-scrollbar pb-1 pr-1">
                  {uninstalledModels.slice(0, 3).map((km) => (
                    <button
                      key={km.name}
                      type="button"
                      disabled={disabled || isAddingModel}
                      onClick={() => onAddModelDraftChange(km.name)}
                      className="flex flex-col gap-2 w-full rounded-[1rem] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 text-left transition hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <div>
                        <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-200">{km.name}</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{km.description}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-0.5 bg-white dark:bg-slate-800">{km.params}</span>
                        <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-0.5 bg-white dark:bg-slate-800">{km.ctx}</span>
                        <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-0.5 bg-white dark:bg-slate-800">{km.size}</span>
                      </div>
                    </button>
                  ))}
                  {uninstalledModels.length > 3 && (
                    <button
                      type="button"
                      onClick={() => setIsAllModelsModalOpen(true)}
                      className="w-full mt-1 rounded-[1rem] border border-dashed border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2.5 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400 transition hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Show {uninstalledModels.length - 3} more models...
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

      ) : null}
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">
            {composerCopy.quickPromptsLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={disabled}
                onClick={() => onPromptSelect(prompt)}
                className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1 text-[11px] text-slate-700 dark:text-slate-300 transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="chat-draft" className="sr-only">
          {composerCopy.label}
        </label>
        <textarea
          id="chat-draft"
          value={draft}
          disabled={disabled}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={1}
          placeholder={composerCopy.placeholder}
          className="w-full resize-none rounded-[1.15rem] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500"
        />
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex min-w-0 items-center gap-2.5">
              <label
                htmlFor="chat-model"
                className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400"
              >
                Model
              </label>
              <button
                id="chat-model"
                type="button"
                disabled={disabled || isAddingModel || models.length === 0}
                onClick={() => setIsModelPickerOpen((open) => !open)}
                className="flex min-w-0 w-full sm:min-w-[15rem] sm:w-auto items-center justify-between gap-3 rounded-[1rem] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-left shadow-sm transition hover:border-slate-300 dark:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {activeModel?.name ?? "Select model"}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {[
                      activeModel?.version && `v${activeModel.version}`,
                      activeModel?.parameterSize,
                      formatContextWindow(activeModel?.contextWindow),
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                </div>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className={`h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 transition ${
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
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-[1.35rem] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-[0_22px_60px_rgba(15,23,42,0.14)] dark:shadow-[0_22px_60px_rgba(0,0,0,0.4)]">
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
                          className={`flex w-full flex-col gap-1 rounded-[1rem] px-3 py-3 text-left transition ${
                            isActive
                              ? "bg-[rgba(201,115,66,0.12)] dark:bg-[rgba(224,146,79,0.15)]"
                              : "hover:bg-slate-50 dark:hover:bg-slate-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {model.name}
                              </p>
                              <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                v{model.version}
                              </p>
                            </div>
                            {isActive ? (
                              <span className="rounded-full bg-[rgba(201,115,66,0.14)] dark:bg-[rgba(224,146,79,0.2)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                Active
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                            {model.family ? (
                              <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-1">
                                {model.family}
                              </span>
                            ) : null}
                            {model.parameterSize ? (
                              <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-1">
                                {model.parameterSize}
                              </span>
                            ) : null}
                            <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-1">
                              {formatContextWindow(model.contextWindow)}
                            </span>
                            {model.quantization ? (
                              <span className="rounded-full border border-slate-200 dark:border-slate-600 px-2 py-1">
                                {model.quantization}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 sm:flex-1 sm:px-4">
              {composerCopy.helperText}
            </p>
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                disabled={disabled || isAddingModel}
                onClick={onOpenAddModel}
                className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add model
              </button>
              <button
                type="button"
                disabled={disabled || isAddingModel}
                onClick={onClearDraft}
                className="rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {composerCopy.clearDraftLabel}
              </button>
              <button
                type="submit"
                disabled={disabled || isAddingModel}
                className="rounded-full bg-slate-950 dark:bg-slate-100 px-3.5 py-1.5 text-[11px] font-medium text-white dark:text-slate-900 transition hover:bg-slate-800 dark:hover:bg-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-600"
              >
                {disabled ? composerCopy.loadingLabel : composerCopy.sendLabel}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
