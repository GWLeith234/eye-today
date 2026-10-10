"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useActionState, useState } from "react";

import { EventFields, type EventFieldValues } from "@/components/events/event-fields";

import { saveEvent, type SaveState } from "./actions";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

type MediaOption = { id: string; storage_path: string; alt: string | null };

export function EventEditorForm({
  id,
  slug,
  values,
  html,
  imageMediaId,
  editorNote,
  promotedUntil,
  media,
  zones,
  notice,
}: {
  id: string;
  slug: string;
  values: EventFieldValues;
  html: string;
  imageMediaId: string;
  editorNote: string;
  promotedUntil: string;
  media: MediaOption[];
  zones: string[];
  notice?: string;
}) {
  const [body, setBody] = useState(html);
  const [state, action, pending] = useActionState(saveEvent, { error: null } satisfies SaveState);
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
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="description_html" value={body} />
      <EventFields values={values} zones={zones} />
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <input name="slug" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={slug} className={field} />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <span id="event-description-label">Description</span>
        <div aria-labelledby="event-description-label" className="min-h-40 rounded border border-rule bg-paper p-3">
          {editor ? <EditorContent editor={editor} /> : <p>Loading editor…</p>}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Image
        <select name="image_media_id" defaultValue={imageMediaId} className={field}>
          <option value="">No image</option>
          {media.map((item) => (
            <option key={item.id} value={item.id}>{item.alt || item.storage_path}</option>
          ))}
        </select>
        <span className="text-xs text-muted">Upload in Media first. Organisers can’t attach images.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Promoted until
        <input name="promoted_until" type="date" defaultValue={promotedUntil} className={field} />
        <span className="text-xs text-muted">Shows a “Promoted” label and sorts first until this date. Leave blank for none.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Editor note (private)
        <textarea name="editor_note" maxLength={500} rows={3} defaultValue={editorNote} className={field} />
      </label>
      <button type="submit" disabled={pending} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
        {pending ? "Saving…" : "Save event"}
      </button>
    </form>
  );
}
