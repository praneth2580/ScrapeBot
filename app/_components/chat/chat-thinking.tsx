type ChatThinkingProps = {
  label: string;
  detail?: string | null;
  step?: number;
  maxSteps?: number;
};

export default function ChatThinking({
  label,
  detail,
  step = 0,
  maxSteps = 5,
}: ChatThinkingProps) {
  const progress =
    maxSteps > 0 ? Math.min(100, Math.round((step / maxSteps) * 100)) : 0;

  return (
    <div className="flex justify-start px-4 pb-2 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-600" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)] border-r-[var(--accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
              Scrapebot
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {label}
            </p>
            {detail ? (
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                {detail}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            {step}/{maxSteps}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-900">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${Math.max(progress, step > 0 ? 12 : 6)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
