type ChatHeaderProps = {
  onOpenSidebar?: () => void;
  eyebrow: string;
  title: string;
  status: string;
};

export default function ChatHeader({
  onOpenSidebar,
  eyebrow,
  title,
  status,
}: ChatHeaderProps) {
  return (
    <header className="border-b border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {onOpenSidebar ? (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 lg:hidden"
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
            <p className="text-sm font-medium text-slate-500">{eyebrow}</p>
            <h2 className="truncate text-lg font-semibold sm:text-xl">{title}</h2>
          </div>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:text-sm">
          {status}
        </div>
      </div>
    </header>
  );
}
