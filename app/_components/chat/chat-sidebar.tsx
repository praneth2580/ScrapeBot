import type { ChatThread, ChatUiConfig } from "./types";

type ChatSidebarProps = {
  activeChatId: number;
  branding: ChatUiConfig["sidebar"];
  actions: ChatUiConfig["actions"];
  sections: ChatUiConfig["sections"];
  recentChats: ChatThread[];
  className?: string;
  onClearChat: () => void;
  onClearDraft: () => void;
  onDeleteChat: (chatId: number) => void;
  onNewChat: () => void;
  onRequestClose?: () => void;
  onSelectChat: (chatId: number) => void;
};

export default function ChatSidebar({
  activeChatId,
  branding,
  actions,
  sections,
  recentChats,
  className,
  onClearChat,
  onClearDraft,
  onDeleteChat,
  onNewChat,
  onRequestClose,
  onSelectChat,
}: ChatSidebarProps) {
  return (
    <aside
      className={`no-scrollbar flex h-full w-80 shrink-0 flex-col overflow-y-auto border-r border-slate-200/80 bg-slate-950 px-6 py-6 text-slate-100 ${className ?? "hidden lg:flex"}`}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.35em] text-amber-300/80">
              {branding.badge}
            </p>
            <h1 className="mt-2 text-xl font-semibold leading-snug">
              {branding.title}
            </h1>
          </div>
          {onRequestClose ? (
            <button
              type="button"
              onClick={onRequestClose}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300 transition hover:border-white/20 hover:bg-white/10 lg:hidden"
            >
              Close
            </button>
          ) : null}
        </div>
        <p className="max-w-xs text-sm leading-5 text-slate-300">
          {branding.description}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onNewChat}
          className="rounded-2xl bg-amber-300 px-4 py-3 text-left text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          {actions.newChatLabel}
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClearChat}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/10"
          >
            {actions.clearChatLabel}
          </button>
          <button
            type="button"
            onClick={onClearDraft}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/10"
          >
            {actions.clearDraftLabel}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-slate-400">
          {sections.recentChatsLabel}
        </p>
        <div className="flex flex-col gap-3">
          {recentChats.map((chat) => {
            const isActive = chat.id === activeChatId;

            return (
              <div
                key={chat.id}
                className={`group relative rounded-2xl border transition ${
                  isActive
                    ? "border-amber-300/40 bg-white/10"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectChat(chat.id);
                    onRequestClose?.();
                  }}
                  className="w-full rounded-2xl px-4 py-3 pr-12 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-100">{chat.title}</p>
                    <span className="shrink-0 text-xs text-slate-400">
                      {chat.updatedAt}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {chat.preview}
                  </p>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${chat.title}`}
                  onClick={() => onDeleteChat(chat.id)}
                  className="absolute right-3 top-3 rounded-full border border-white/10 bg-slate-900/80 p-2 text-slate-300 opacity-0 transition hover:border-rose-300/30 hover:bg-rose-400/10 hover:text-rose-200 focus:opacity-100 focus:outline-none group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
