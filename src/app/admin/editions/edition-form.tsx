"use client";

import { useActionState, useState } from "react";

import { generatePdf, type PdfState, saveEdition, type SaveState } from "./actions";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export type StoryChoice = { id: string; title: string; section: string; live: boolean; published_at: string | null };
export type CoverChoice = { id: string; label: string };

export type EditionValues = {
  id: string;
  title: string;
  issue_month: string; // yyyy-mm
  slug: string;
  cover_media_id: string;
  letter: string;
  status: "draft" | "published";
  public_from: string; // yyyy-mm-ddThh:mm (UTC)
  early_days: number;
  story_ids: string[];
  pdf_generated_at: string | null;
};

function StoryList({ chosen, setChosen, available }: { chosen: string[]; setChosen: (ids: string[]) => void; available: Map<string, StoryChoice> }) {
  const move = (index: number, delta: number) => {
    const next = [...chosen];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setChosen(next);
  };
  return (
    <ol aria-label="Stories in this issue" className="flex flex-col gap-1">
      {chosen.map((id, index) => {
        const story = available.get(id);
        return (
          <li key={id} className="flex items-center gap-2 rounded border border-rule p-2 text-sm">
            <input type="hidden" name="story_id" value={id} />
            <span className="w-6 text-right tabular-nums text-muted">{index + 1}.</span>
            <span className="flex-1">
              <span className="font-semibold">{story?.title ?? "Unknown story"}</span>
              <span className="text-muted"> · {story?.section}</span>
              {story && !story.live ? <span className="ml-2 rounded bg-amber-100 px-1 text-xs">not published</span> : null}
            </span>
            <button type="button" aria-label={`Move ${story?.title ?? "story"} up`} onClick={() => move(index, -1)} disabled={index === 0} className="rounded border border-rule px-2 disabled:opacity-40">↑</button>
            <button type="button" aria-label={`Move ${story?.title ?? "story"} down`} onClick={() => move(index, 1)} disabled={index === chosen.length - 1} className="rounded border border-rule px-2 disabled:opacity-40">↓</button>
            <button type="button" aria-label={`Remove ${story?.title ?? "story"}`} onClick={() => setChosen(chosen.filter((x) => x !== id))} className="rounded border border-rule px-2">×</button>
          </li>
        );
      })}
    </ol>
  );
}

export function EditionForm({ values, stories, covers, notice }: { values: EditionValues; stories: StoryChoice[]; covers: CoverChoice[]; notice?: string }) {
  const [state, action, pending] = useActionState(saveEdition, { error: null } satisfies SaveState);
  const [pdf, pdfAction, pdfPending] = useActionState(generatePdf, { error: null } satisfies PdfState);
  const [chosen, setChosen] = useState<string[]>(values.story_ids);
  const [status, setStatus] = useState(values.status);
  const [filter, setFilter] = useState("");
  const available = new Map(stories.map((s) => [s.id, s]));
  const candidates = stories.filter((s) => !chosen.includes(s.id) && (!filter || s.title.toLowerCase().includes(filter.toLowerCase())));

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="grid max-w-3xl gap-3">
        {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
        {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
        <input type="hidden" name="id" value={values.id} />
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input name="title" required maxLength={160} defaultValue={values.title} className={field} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Issue month
            <input name="issue_month" type="month" required defaultValue={values.issue_month} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Slug
            <input name="slug" maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="Defaults to the month, e.g. 2026-10" defaultValue={values.slug} className={field} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Cover image
          <select name="cover_media_id" defaultValue={values.cover_media_id} className={field}>
            <option value="">No cover image</option>
            {covers.map((cover) => (
              <option key={cover.id} value={cover.id}>{cover.label}</option>
            ))}
          </select>
          <span className="text-xs text-muted">Upload images under Media first.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Editor’s letter
          <textarea name="letter" maxLength={12000} rows={8} defaultValue={values.letter} className={field} />
          <span className="text-xs text-muted">Plain text. Leave a blank line between paragraphs.</span>
        </label>

        <fieldset className="flex flex-col gap-2 rounded border border-rule p-3">
          <legend className="px-1 text-sm font-semibold">Stories</legend>
          {chosen.length === 0 ? <p className="text-sm text-muted">No stories yet. Add published stories below.</p> : null}
          <StoryList chosen={chosen} setChosen={setChosen} available={available} />
          <label className="flex flex-col gap-1 text-sm">
            Add a story
            <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by title" className={field} />
          </label>
          <ul aria-label="Published stories" className="max-h-64 overflow-y-auto rounded border border-rule text-sm">
            {candidates.length === 0 ? <li className="p-2 text-muted">Nothing to add.</li> : null}
            {candidates.slice(0, 60).map((story) => (
              <li key={story.id} className="flex items-center justify-between gap-2 border-b border-rule p-2 last:border-b-0">
                <span>
                  {story.title} <span className="text-muted">· {story.section}</span>
                </span>
                <button type="button" onClick={() => setChosen([...chosen, story.id])} className="rounded border border-rule px-2 py-0.5">Add</button>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            Status
            <select name="status" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")} className={field}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Public from (UTC)
            <input name="public_from" type="datetime-local" required={status === "published"} defaultValue={values.public_from} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Supporter early access (days)
            <input name="early_days" type="number" min={0} max={30} defaultValue={values.early_days} className={field} />
          </label>
        </div>
        <p className="text-xs text-muted">A future “public from” date schedules the issue. Supporters see it that many days earlier.</p>
        <div>
          <button type="submit" disabled={pending} className="rounded bg-ink px-4 py-2 text-paper disabled:opacity-60">
            {pending ? "Saving…" : "Save edition"}
          </button>
        </div>
      </form>

      {values.id ? (
        <form action={pdfAction} className="flex max-w-3xl flex-col gap-2 rounded border border-rule p-3">
          <input type="hidden" name="id" value={values.id} />
          <h2 className="font-semibold">PDF</h2>
          <p className="text-sm text-muted">
            {values.pdf_generated_at ? `Last generated ${new Date(values.pdf_generated_at).toUTCString()}.` : "No PDF yet."} Save the edition first; the PDF uses what is saved and includes published stories only.
          </p>
          {pdf.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{pdf.error}</p> : null}
          {pdf.pages ? <p role="status" className="rounded border border-green-600 p-2 text-sm">PDF generated ({pdf.pages} pages).</p> : null}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pdfPending} className="rounded border border-ink px-4 py-2 disabled:opacity-60">
              {pdfPending ? "Generating…" : values.pdf_generated_at ? "Regenerate PDF" : "Generate PDF"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
