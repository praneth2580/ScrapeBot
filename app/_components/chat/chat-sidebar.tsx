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
      className={`flex h-full w-[17.5rem] shrink-0 flex-col border-r border-white/10 bg-slate-950 text-slate-100 xl:w-80 ${className ?? "hidden lg:flex"}`}
    >
      <div className="shrink-0 space-y-5 px-5 pb-4 pt-6">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-amber-300/80">
                {branding.badge}
              </p>
              <h1 className="mt-1.5 truncate text-lg font-semibold leading-snug">
                {branding.title}
              </h1>
            </div>
            {onRequestClose ? (
              <button
                type="button"
                onClick={onRequestClose}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300 transition hover:border-white/20 hover:bg-white/10 lg:hidden"
              >
                Close
              </button>
            ) : null}
          </div>
          <p className="text-sm leading-5 text-slate-400 line-clamp-3">
            {branding.description}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onNewChat}
            className="rounded-xl bg-amber-300 px-4 py-2.5 text-left text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            {actions.newChatLabel}
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onClearChat}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/10"
            >
              {actions.clearChatLabel}
            </button>
            <button
              type="button"
              onClick={onClearDraft}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/10"
            >
              {actions.clearDraftLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-white/10">
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">
            {sections.recentChatsLabel}
          </p>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] tabular-nums text-slate-400">
            {recentChats.length}
          </span>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-5">
          {recentChats.length === 0 ? (
            <div className="mx-2 rounded-xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-300">No chats yet</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Start a new chat to see it listed here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {recentChats.map((chat) => {
                const isActive = chat.id === activeChatId;

                return (
                  <li key={chat.id}>
                    <div
                      className={`group relative rounded-xl border transition ${
                        isActive
                          ? "border-amber-300/35 bg-white/10"
                          : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectChat(chat.id);
                          onRequestClose?.();
                        }}
                        className="w-full rounded-xl px-3 py-2.5 pr-10 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p
                            className={`min-w-0 flex-1 truncate text-sm font-medium ${
                              isActive ? "text-amber-100" : "text-slate-100"
                            }`}
                            title={chat.title}
                          >
                            {chat.title}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-500">
                            {chat.updatedAt}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                          {chat.preview}
                        </p>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${chat.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteChat(chat.id);
                        }}
                        className="absolute right-2 top-2 rounded-lg border border-transparent p-1.5 text-slate-500 opacity-0 transition hover:border-rose-300/25 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/40 group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
