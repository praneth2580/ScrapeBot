"use client";

import { FormEvent, useState } from "react";

type ChatUrlPromptProps = {
  disabled?: boolean;
  error?: string | null;
  status?: string | null;
  onParse: (url: string, focus?: string) => Promise<void> | void;
  onSkip?: () => void;
};

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export default function ChatUrlPrompt({
  disabled = false,
  error,
  status = null,
  onParse,
  onSkip,
}: ChatUrlPromptProps) {
  const [url, setUrl] = useState("");
  const [focus, setFocus] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    const normalized = normalizeUrl(url);
    if (!normalized) {
      setLocalError("Enter a valid http(s) URL, e.g. https://example.com");
      return;
    }

    await onParse(normalized, focus.trim() || undefined);
  }

  const displayError = localError || error;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-6 sm:px-6">
      <div className="w-full max-w-xl rounded-[1.75rem] border border-slate-200/90 dark:border-slate-700/70 bg-white/85 dark:bg-slate-800/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
          Start with a page
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900 dark:text-slate-100">
          Enter a URL to parse
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
          Scrapebot will open the page, extract its content, and prepare this chat
          so you can ask questions about it.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Page URL
            </span>
            <input
              type="url"
              name="url"
              autoFocus
              autoComplete="url"
              inputMode="url"
              disabled={disabled}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder="https://example.com/docs"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              What should we focus on?{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <input
              type="text"
              name="focus"
              disabled={disabled}
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              placeholder="e.g. pricing table, signup form, API endpoints"
              className="mt-1.5 w-full rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 disabled:opacity-60"
            />
          </label>

          {displayError ? (
            <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
              {displayError}
            </p>
          ) : null}

          {disabled && status ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-600 dark:bg-slate-900/60">
              <div className="relative h-7 w-7 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-600" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={disabled || !url.trim()}
              className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disabled ? "Parsing page…" : "Parse page"}
            </button>
            {onSkip ? (
              <button
                type="button"
                disabled={disabled}
                onClick={onSkip}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-900/50 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Skip — chat without a page
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
