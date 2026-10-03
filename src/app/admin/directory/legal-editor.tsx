"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useActionState, useState } from "react";

import { saveLegal, type SaveState } from "./actions";

const field = "rounded border px-3 py-2 text-base";

export function LegalEditor({
  code,
  title,
  html,
  sources,
  asOf,
  status,
  notice,
}: {
  code: string;
  title: string;
  html: string;
  sources: string;
  asOf: string;
  status: "draft" | "published";
  notice?: string;
}) {
  const [body, setBody] = useState(html);
  const [state, action, pending] = useActionState(saveLegal, { error: null } satisfies SaveState);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: html || "<p></p>",
    onUpdate: ({ editor: current }) => setBody(current.getHTML()),
  });

  return (
    <form action={action} className="grid max-w-2xl gap-3">
      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
      <input type="hidden" name="country_code" value={code} />
      <input type="hidden" name="summary_html" value={body} />
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input name="title" defaultValue={title} maxLength={160} className={field} />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <span id="legal-summary-label">Legal summary</span>
        <div aria-labelledby="legal-summary-label" className="min-h-40 rounded border p-3">
          {editor ? <EditorContent editor={editor} /> : <p>Loading editor…</p>}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Sources
        <textarea name="sources" defaultValue={sources} rows={5} placeholder="Title | https://example.com" className={field} />
        <span className="text-xs opacity-70">One source per line. Publishing needs at least one https link.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        As of
        <input name="as_of" type="date" defaultValue={asOf} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue={status} className={field}>
          <option value="draft">draft</option>
          <option value="published">published</option>
        </select>
      </label>
      <button type="submit" disabled={pending} className="self-start rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
        {pending ? "Saving…" : "Save legal status"}
      </button>
    </form>
  );
}
