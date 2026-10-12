"use client";

import { useActionState } from "react";

import { TRACKER_KIND_SINGULAR, TRACKER_KINDS, type TrackerKind } from "@/lib/tracker/model";

import { saveTrackerEntry, type SaveState } from "./actions";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export type StoryChoice = { id: string; title: string; section: string };

export type EntryValues = {
  id: string;
  kind: TrackerKind;
  title: string;
  slug: string;
  sponsor: string;
  stage: string;
  amount: string;
  jurisdiction: string;
  key_dates: string; // "Label | yyyy-mm-dd" per line
  links: string; // "Title | https://" per line
  notes: string;
  article_id: string;
  last_reviewed: string;
  status: "draft" | "published";
  sort: number;
};

export function EntryForm({ values, stories, notice }: { values: EntryValues; stories: StoryChoice[]; notice?: string }) {
  const [state, action, pending] = useActionState(saveTrackerEntry, { error: null } satisfies SaveState);
  return (
    <form action={action} className="grid max-w-3xl gap-3">
      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
      <input type="hidden" name="id" value={values.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Kind
          <select name="kind" defaultValue={values.kind} className={field}>
            {TRACKER_KINDS.map((kind) => (
              <option key={kind} value={kind}>{TRACKER_KIND_SINGULAR[kind]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Title
          <input name="title" required maxLength={200} defaultValue={values.title} className={field} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Slug
          <input name="slug" maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="Defaults to the title" defaultValue={values.slug} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sponsor or agency
          <input name="sponsor" maxLength={160} defaultValue={values.sponsor} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Stage or status
          <input name="stage" maxLength={60} defaultValue={values.stage} placeholder="Recruiting · Enacted · Open for comment" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Amount
          <input name="amount" maxLength={80} defaultValue={values.amount} placeholder="USD 50 million" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Jurisdiction
          <input name="jurisdiction" maxLength={120} defaultValue={values.jurisdiction} placeholder="Texas, United States" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Last reviewed
          <input name="last_reviewed" type="date" defaultValue={values.last_reviewed} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Key dates
        <textarea name="key_dates" rows={3} defaultValue={values.key_dates} placeholder="Comments close | 2026-11-20" className={field} />
        <span className="text-xs text-muted">One per line: label | yyyy-mm-dd.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Links
        <textarea name="links" rows={3} defaultValue={values.links} placeholder="Docket FDA-2026-N-10429 | https://www.regulations.gov/…" className={field} />
        <span className="text-xs text-muted">One per line: title | https://… Primary sources first.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea name="notes" rows={4} maxLength={2000} defaultValue={values.notes} className={field} />
        <span className="text-xs text-muted">What a reader needs to know in two or three sentences. No outcome claims.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Our story
          <select name="article_id" defaultValue={values.article_id} className={field}>
            <option value="">None yet</option>
            {stories.map((story) => (
              <option key={story.id} value={story.id}>{story.title} · {story.section}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Order within kind
          <input name="sort" type="number" min={0} max={999} defaultValue={values.sort} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={values.status} className={field}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <button type="submit" disabled={pending} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
        {pending ? "Saving…" : "Save entry"}
      </button>
    </form>
  );
}
