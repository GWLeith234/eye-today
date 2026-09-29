export function StaticPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="font-serif text-4xl font-bold">{title}</h1>
      <div className="text-lg leading-relaxed">{children}</div>
    </div>
  );
}
