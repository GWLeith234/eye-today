"use client";

import { useActionState, useId } from "react";

import { subscribeToNewsletter } from "@/app/(public)/newsletter/actions";
import type { SignupState } from "@/lib/newsletter/signup";

const LISTS = [
  { slug: "daily", name: "Daily Brief" },
  { slug: "weekly", name: "Weekly Roundup" },
];

// Used on /newsletter, in the header and footer, and under each article. It renders no
// cookie-dependent content, so the server components around it stay cacheable.
export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState<SignupState | null, FormData>(subscribeToNewsletter, null);
  const id = useId();

  return (
    <form action={action} className={compact ? "flex flex-col gap-2 text-sm" : "flex flex-col gap-3"}>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-1">
        <legend className="mb-1 font-semibold">Email me</legend>
        {LISTS.map((list) => (
          <label key={list.slug} className="flex items-center gap-2">
            <input type="checkbox" name="lists" value={list.slug} />
            {list.name}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${id}-email`} className="flex flex-col gap-1">
        <span className="font-semibold">Email address</span>
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          required
          autoComplete="email"
          maxLength={254}
          className="rounded border border-rule bg-white px-3 py-2 text-base"
        />
      </label>
      {/* Honeypot: hidden from readers and assistive tech. */}
      <div aria-hidden="true" className="hidden">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="text-muted">
        By subscribing you are asking Eye Today to email you the lists you tick above. We&apos;ll send one message to confirm first.
      </p>
      <button type="submit" disabled={pending} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-60">
        {pending ? "Sending…" : "Subscribe"}
      </button>
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "font-semibold" : "font-semibold text-red-700"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
