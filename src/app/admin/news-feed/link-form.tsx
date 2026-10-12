"use client";

import { useActionState, useState, useTransition } from "react";

import { BLURB_MAX } from "@/lib/newsroom/model";

import { fetchLinkPreview, saveNewsLink, type SaveState } from "./actions";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export type LinkValues = {
  id: string;
  url: string;
  title: string;
  source_name: string;
  published_on: string; // yyyy-mm-dd
  blurb: string;
  tags: string; // comma separated
  status: "draft" | "published";
};

export function LinkForm({ values, notice }: { values: LinkValues; notice?: string }) {
  const [state, action, pending] = useActionState(saveNewsLink, { error: null } satisfies SaveState);
  const [url, setUrl] = useState(values.url);
  const [title, setTitle] = useState(values.title);
  const [source, setSource] = useState(values.source_name);
  const [publishedOn, setPublishedOn] = useState(values.published_on);
  const [blurb, setBlurb] = useState(values.blurb);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, startFetch] = useTransition();

  const prefill = () => {
    setFetchError(null);
    startFetch(async () => {
      const result = await fetchLinkPreview(url);
      if (!result.ok) {
        setFetchError(result.error);
        return;
      }
      if (!title) setTitle(result.preview.title);
      if (!source) setSource(result.preview.source);
      if (!publishedOn && result.preview.publishedOn) setPublishedOn(result.preview.publishedOn);
      if (!blurb && result.preview.description) setBlurb(result.preview.description.slice(0, BLURB_MAX));
    });
  };

  return (
    <form action={action} className="grid max-w-2xl gap-3">
      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
      <input type="hidden" name="id" value={values.id} />
      <label className="flex flex-col gap-1 text-sm">
        Link
        <div className="flex gap-2">
          <input name="url" type="url" required inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={`${field} flex-1`} />
          <button type="button" onClick={prefill} disabled={fetching || !url} className="rounded border border-rule px-3 py-2 text-sm disabled:opacity-50">
            {fetching ? "Fetching…" : "Fetch details"}
          </button>
        </div>
        <span className="text-xs text-muted">Fetch reads the page&rsquo;s own headline, outlet and date. Nothing is saved until you save the form.</span>
        {fetchError ? <span role="alert" className="text-xs text-red-700">{fetchError}</span> : null}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Headline
        <input name="title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Outlet
          <input name="source_name" required maxLength={120} value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. The Texas Tribune" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Published on
          <input name="published_on" type="date" required value={publishedOn} onChange={(e) => setPublishedOn(e.target.value)} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Blurb
        <textarea name="blurb" maxLength={BLURB_MAX} rows={3} value={blurb} onChange={(e) => setBlurb(e.target.value)} className={field} />
        <span className="text-xs text-muted">
          In our own words, never a copied paragraph. {blurb.length}/{BLURB_MAX}.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tags
        <input name="tags" maxLength={400} defaultValue={values.tags} placeholder="texas, trials, policy" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={values.status} className={field}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <button type="submit" disabled={pending} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
        {pending ? "Saving…" : "Save link"}
      </button>
    </form>
  );
}
