"use client";

import Link from "next/link";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="font-serif text-3xl font-bold">Something went wrong</h1>
      <p>The newsroom page did not load. Nothing on screen is an error detail.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="rounded bg-ink px-4 py-2 text-paper">Try again</button>
        <Link href="/admin" className="rounded border border-ink px-4 py-2">Newsroom home</Link>
      </div>
    </div>
  );
}
