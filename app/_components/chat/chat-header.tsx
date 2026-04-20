type ChatHeaderProps = {
  onOpenSidebar?: () => void;
  onToggleTheme?: () => void;
  isDark?: boolean;
  eyebrow: string;
  title: string;
  status: string;
};

export default function ChatHeader({
  onOpenSidebar,
  onToggleTheme,
  isDark = false,
  eyebrow,
  title,
  status,
}: ChatHeaderProps) {
  return (
    <header className="border-b border-slate-200/80 dark:border-slate-700/60 bg-white/70 dark:bg-slate-800/70 px-5 py-4 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {onOpenSidebar ? (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600 lg:hidden"
              aria-label="Open chats"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h10" />
              </svg>
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{eyebrow}</p>
            <h2 className="truncate text-lg font-semibold sm:text-xl">{title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-amber-300 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"
            >
              {isDark ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          ) : null}
          <div className="rounded-full border border-emerald-200 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 sm:text-sm">
            {status}
          </div>
        </div>
      </div>
    </header>
  );
}
