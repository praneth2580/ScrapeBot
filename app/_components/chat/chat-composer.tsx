import type { ChatUiConfig } from "./types";
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
  return (
    <div className="relative border-t border-slate-200/80 bg-white/75 px-4 py-3 backdrop-blur sm:px-5">
      {isAddModelOpen ? (
        <div className="absolute bottom-[calc(100%+0.75rem)] right-4 z-20 w-full max-w-sm rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:right-5">
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
      <form onSubmit={onSubmit} className="space-y-2.5">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500">
            {composerCopy.quickPromptsLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={disabled}
                onClick={() => onPromptSelect(prompt)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
          rows={2}
          placeholder={composerCopy.placeholder}
          className="w-full resize-none rounded-[1.25rem] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
        />
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <label
                htmlFor="chat-model"
                className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500"
              >
                Model
              </label>
              <select
                id="chat-model"
                value={selectedModel}
                disabled={disabled || isAddingModel || models.length === 0}
                onChange={(event) => onModelChange(event.target.value)}
                className="min-w-0 max-w-44 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {models.map((model) => (
                  <option key={model.value} value={model.value}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 sm:flex-1 sm:px-4">
              {composerCopy.helperText}
            </p>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                disabled={disabled || isAddingModel}
                onClick={onOpenAddModel}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add model
              </button>
              <button
                type="button"
                disabled={disabled || isAddingModel}
                onClick={onClearDraft}
                className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {composerCopy.clearDraftLabel}
              </button>
              <button
                type="submit"
                disabled={disabled || isAddingModel}
                className="rounded-full bg-slate-950 px-4 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
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
