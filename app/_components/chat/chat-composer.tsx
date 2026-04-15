import type { ChatUiConfig } from "./types";
import { useMemo, useState } from "react";
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

  return (
    <div className="relative border-t border-slate-200/80 bg-white/75 px-4 py-2.5 backdrop-blur sm:px-5">
      {isAddModelOpen ? (
        <div className="absolute bottom-[calc(100%+0.75rem)] left-0 right-0 z-20 mx-auto w-[calc(100vw-2rem)] max-w-sm rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:left-auto sm:right-5 sm:mx-0 sm:w-full">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Add Ollama model</p>
              <p className="mt-1 text-xs text-slate-500">
                Pull a local model by name, like `llama3.1` or `qwen2.5:7b`.
              </p>
            </div>
            <button
              type="button"
              disabled={isAddingModel}
              onClick={onCloseAddModel}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              disabled={disabled || isAddingModel || !addModelDraft.trim()}
              onClick={onAddModel}
              className="rounded-full border border-slate-200 bg-slate-950 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-400"
            >
              {isAddingModel ? "Pulling..." : "Add"}
            </button>
          </div>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="space-y-2">
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500">
            {composerCopy.quickPromptsLabel}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={disabled}
                onClick={() => onPromptSelect(prompt)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="w-full resize-none rounded-[1.15rem] border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
        />
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex min-w-0 items-center gap-2.5">
              <label
                htmlFor="chat-model"
                className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500"
              >
                Model
              </label>
              <button
                id="chat-model"
                type="button"
                disabled={disabled || isAddingModel || models.length === 0}
                onClick={() => setIsModelPickerOpen((open) => !open)}
                className="flex min-w-0 w-full sm:min-w-[15rem] sm:w-auto items-center justify-between gap-3 rounded-[1rem] border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {activeModel?.name ?? "Select model"}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
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
                  className={`h-4 w-4 shrink-0 text-slate-500 transition ${
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
                <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.14)]">
                  <div className="max-h-72 overflow-y-auto p-2">
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
                              ? "bg-[rgba(201,115,66,0.12)]"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {model.name}
                              </p>
                              <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                v{model.version}
                              </p>
                            </div>
                            {isActive ? (
                              <span className="rounded-full bg-[rgba(201,115,66,0.14)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                Active
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                            {model.family ? (
                              <span className="rounded-full border border-slate-200 px-2 py-1">
                                {model.family}
                              </span>
                            ) : null}
                            {model.parameterSize ? (
                              <span className="rounded-full border border-slate-200 px-2 py-1">
                                {model.parameterSize}
                              </span>
                            ) : null}
                            <span className="rounded-full border border-slate-200 px-2 py-1">
                              {formatContextWindow(model.contextWindow)}
                            </span>
                            {model.quantization ? (
                              <span className="rounded-full border border-slate-200 px-2 py-1">
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
            <p className="text-xs text-slate-500 sm:flex-1 sm:px-4">
              {composerCopy.helperText}
            </p>
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                disabled={disabled || isAddingModel}
                onClick={onOpenAddModel}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add model
              </button>
              <button
                type="button"
                disabled={disabled || isAddingModel}
                onClick={onClearDraft}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {composerCopy.clearDraftLabel}
              </button>
              <button
                type="submit"
                disabled={disabled || isAddingModel}
                className="rounded-full bg-slate-950 px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
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
