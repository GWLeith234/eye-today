"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="font-serif text-4xl font-bold">Something went wrong</h1>
      <p className="text-lg">This page did not load. You can try again, or go back to the front page.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => reset()} className="rounded bg-ink px-4 py-2 text-paper">Try again</button>
        <Link href="/" className="rounded border border-ink px-4 py-2">Front page</Link>
      </div>
    </div>
  );
}
