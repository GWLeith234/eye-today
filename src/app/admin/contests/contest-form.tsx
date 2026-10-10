"use client";

import { useActionState } from "react";

import { saveContest, type SaveState } from "./actions";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export type ContestValues = {
  id: string;
  slug: string;
  title: string;
  description: string;
  prize: string;
  rules: string;
  eligibility: string;
  question: string;
  status: string;
  opens_at: string;
  closes_at: string;
};

export function ContestForm({ values, notice }: { values: ContestValues; notice?: string }) {
  const [state, action, pending] = useActionState(saveContest, { error: null } satisfies SaveState);
  return (
    <form action={action} className="grid max-w-2xl gap-3">
      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
      <input type="hidden" name="id" value={values.id} />
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input name="title" required maxLength={160} defaultValue={values.title} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <input name="slug" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={values.slug} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Prize
        <input name="prize" required maxLength={300} defaultValue={values.prize} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea name="description" maxLength={4000} rows={4} defaultValue={values.description} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Rules (required)
        <textarea name="rules" required minLength={20} maxLength={12000} rows={8} defaultValue={values.rules} className={field} />
        <span className="text-xs text-muted">Who runs it, how and when the winner is chosen and told, prize details, and anything excluded. Plain text.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Who can enter
        <input name="eligibility" maxLength={1000} placeholder="Adults 18+ living in Canada, excluding Eye Today staff" defaultValue={values.eligibility} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Optional question for entrants
        <input name="question" maxLength={300} defaultValue={values.question} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={values.status} className={field}>
          <option value="draft">Draft (hidden)</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Opens (UTC, optional)
          <input name="opens_at" type="datetime-local" defaultValue={values.opens_at} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Closes (UTC)
          <input name="closes_at" type="datetime-local" required defaultValue={values.closes_at} className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
        {pending ? "Saving…" : "Save contest"}
      </button>
    </form>
  );
}
