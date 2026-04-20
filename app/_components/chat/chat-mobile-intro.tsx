type ChatMobileIntroProps = {
  badge: string;
  description: string;
};

export default function ChatMobileIntro({
  badge,
  description,
}: ChatMobileIntroProps) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-4 shadow-sm lg:hidden">
      <p className="text-xs font-medium uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
        {badge}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}
