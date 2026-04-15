type ChatHeaderProps = {
  eyebrow: string;
  title: string;
  status: string;
};

export default function ChatHeader({
  eyebrow,
  title,
  status,
}: ChatHeaderProps) {
  return (
    <header className="border-b border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{eyebrow}</p>
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
          {status}
        </div>
      </div>
    </header>
  );
}
