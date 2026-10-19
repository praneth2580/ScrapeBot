"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

type ChatMarkdownProps = {
  content: string;
  variant?: "assistant" | "user";
};

const assistantComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-5 text-xl font-semibold tracking-tight text-slate-900 first:mt-0 dark:text-slate-50">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-4 text-lg font-semibold tracking-tight text-slate-900 first:mt-0 dark:text-slate-50">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-base font-semibold text-slate-900 first:mt-0 dark:text-slate-100">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1.5 mt-3 text-sm font-semibold text-slate-800 first:mt-0 dark:text-slate-200">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="my-2.5 text-[15px] leading-7 text-slate-700 first:mt-0 last:mb-0 dark:text-slate-200">
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="break-words font-medium text-[var(--accent-strong)] underline decoration-[var(--accent)]/40 underline-offset-2 transition hover:decoration-[var(--accent)]"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-slate-700 dark:text-slate-200">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-slate-700 dark:text-slate-200">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5 marker:text-slate-400">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900 dark:text-slate-50">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-slate-700 dark:text-slate-300">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-slate-300 pl-4 text-slate-600 italic dark:border-slate-500 dark:text-slate-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-slate-200 dark:border-slate-600" />,
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 px-3.5 py-3 text-[13px] leading-6 text-slate-100 dark:bg-black/50">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800 dark:bg-slate-900 dark:text-amber-100">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-3 overflow-x-auto">{children}</pre>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600">
      <table className="min-w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-50 text-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-slate-200 px-3 py-2 font-semibold dark:border-slate-600">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700 dark:border-slate-700 dark:text-slate-300">
      {children}
    </td>
  ),
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt || ""}
      className="my-3 max-h-80 max-w-full rounded-xl border border-slate-200 object-contain dark:border-slate-600"
    />
  ),
};

const userComponents: Components = {
  p: ({ children }) => (
    <p className="my-1.5 text-[15px] leading-7 first:mt-0 last:mb-0">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="break-words underline underline-offset-2 opacity-90 hover:opacity-100"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/15 px-1 py-0.5 font-mono text-[13px] dark:bg-slate-900/15">
      {children}
    </code>
  ),
};

export default function ChatMarkdown({
  content,
  variant = "assistant",
}: ChatMarkdownProps) {
  return (
    <div
      className={`chat-markdown min-w-0 [overflow-wrap:anywhere] ${
        variant === "assistant" ? "space-y-0" : ""
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={variant === "user" ? userComponents : assistantComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
