import Link from "next/link";
import AISettingsPanel from "../_components/ai-settings-panel";

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#d6e0ea_0%,#eef2f6_40%,#f7f8fa_100%)] dark:bg-[linear-gradient(180deg,#0d1117_0%,#111827_45%,#0b1220_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Scrapebot
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              AI provider settings
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-200 dark:border-slate-600 bg-white/80 dark:bg-slate-800/80 px-4 py-2 text-sm font-medium transition hover:bg-white dark:hover:bg-slate-700"
          >
            Back to chat
          </Link>
        </div>
        <AISettingsPanel />
      </div>
    </main>
  );
}
