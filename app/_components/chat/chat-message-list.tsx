import type { Message } from "./types";
import ChatMarkdown from "./chat-markdown";
import ChatThinking from "./chat-thinking";

type ChatMessageListProps = {
  messages: Message[];
  thinking?: {
    label: string;
    detail?: string | null;
    step?: number;
    maxSteps?: number;
  } | null;
};

export default function ChatMessageList({
  messages,
  thinking = null,
}: ChatMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-8 text-center sm:px-8">
        <div className="max-w-md rounded-3xl border border-dashed border-slate-300/90 bg-white/70 px-6 py-10 text-slate-600 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
          <p className="text-base font-medium text-slate-800 dark:text-slate-200">
            Start a conversation
          </p>
          <p className="mt-2 text-sm leading-6">
            Ask about selectors, page structure, or scraping workflows — or parse a
            URL from a new chat.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="flex w-full min-w-0 flex-col gap-5 px-4 py-5 pb-6 sm:px-6 sm:py-6 lg:px-8">
        {messages.map((message) => {
          const isUser = message.role === "user";

          return (
            <article
              key={message.id}
              className={`flex min-w-0 ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`min-w-0 overflow-hidden rounded-2xl px-4 py-3.5 shadow-sm sm:px-5 sm:py-4 ${
                  isUser ? "max-w-[min(100%,52rem)]" : "w-full max-w-none"
                } ${
                  isUser
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-200/90 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                <p
                  className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] ${
                    isUser
                      ? "text-white/55 dark:text-slate-900/45"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {isUser ? "You" : "Scrapebot"}
                </p>
                <ChatMarkdown
                  content={message.text}
                  variant={isUser ? "user" : "assistant"}
                />
              </div>
            </article>
          );
        })}
        {thinking ? (
          <ChatThinking
            label={thinking.label}
            detail={thinking.detail}
            step={thinking.step}
            maxSteps={thinking.maxSteps}
          />
        ) : null}
      </div>
    </div>
  );
}
