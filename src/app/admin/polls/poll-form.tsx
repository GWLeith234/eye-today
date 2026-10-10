"use client";

import { useActionState } from "react";

import { savePoll, type SaveState } from "./actions";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export function PollForm({
  id,
  question,
  status,
  results,
  opensAt,
  closesAt,
  options,
  notice,
}: {
  id: string;
  question: string;
  status: string;
  results: string;
  opensAt: string;
  closesAt: string;
  options: { id: string; label: string }[];
  notice?: string;
}) {
  const [state, action, pending] = useActionState(savePoll, { error: null } satisfies SaveState);
  const slots = [...options, ...Array.from({ length: Math.max(0, 6 - options.length) }, () => ({ id: "", label: "" }))].slice(0, 6);
  return (
    <form action={action} className="grid max-w-xl gap-3">
      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-sm">
        Question
        <input name="question" required maxLength={200} defaultValue={question} className={field} />
      </label>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1">Options (two to six; leave the rest blank)</legend>
        {slots.map((slot, index) => (
          <span key={slot.id || `new-${index}`} className="contents">
            <input type="hidden" name="option_id" value={slot.id} />
            <input name="option" maxLength={120} defaultValue={slot.label} aria-label={`Option ${index + 1}`} className={field} />
          </span>
        ))}
        <span className="text-xs text-muted">Editing an option’s text keeps its votes. Emptying an option removes it, which is only allowed while it has no votes.</span>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={status} className={field}>
          <option value="draft">Draft (hidden)</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Show results
        <select name="results" defaultValue={results} className={field}>
          <option value="after_vote">After the reader votes</option>
          <option value="after_close">Only after the poll closes</option>
          <option value="always">To everyone, always</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Opens (UTC, optional)
          <input name="opens_at" type="datetime-local" defaultValue={opensAt} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Closes (UTC, optional)
          <input name="closes_at" type="datetime-local" defaultValue={closesAt} className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
        {pending ? "Saving…" : "Save poll"}
      </button>
    </form>
  );
}
