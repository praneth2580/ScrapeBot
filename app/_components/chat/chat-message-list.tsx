import type { Message } from "./types";

type ChatMessageListProps = {
  messages: Message[];
};

export default function ChatMessageList({ messages }: ChatMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-6 text-center sm:px-6">
        <div className="max-w-md rounded-[1.75rem] border border-dashed border-slate-300 dark:border-slate-600 bg-white/60 dark:bg-slate-800/60 px-6 py-8 text-slate-600 dark:text-slate-400">
          Start a new conversation to see messages here.
        </div>
      </div>
    );
  }

  return (
    <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-6">
      {messages.map((message) => {
        const isUser = message.role === "user";

        return (
          <article
            key={message.id}
            className={`flex ${isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-2xl rounded-[1.75rem] px-5 py-4 shadow-sm ${
                isUser
                  ? "bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-900"
                  : "border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-800/85 text-slate-700 dark:text-slate-300"
              }`}
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] opacity-60">
                {message.role}
              </p>
              <p className="text-[15px] leading-7">{message.text}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
