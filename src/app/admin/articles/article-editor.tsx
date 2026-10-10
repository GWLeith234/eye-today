"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { editorExtensions } from "@/lib/editor/extensions";
import { parseEmbedUrl } from "@/lib/editor/embed";
import { mediaUrl } from "@/lib/media/url";
import { slugify } from "@/lib/slug";

import { saveContribution } from "@/app/contribute/actions";

import { AiPanel } from "./ai-panel";

import { restoreRevision, type SaveIntent, saveArticle } from "./actions";

type Outcome =
  | { ok: true; id: string; status: string; warning?: string }
  | { ok: false; error: string; field?: string };

export type EditorArticle = {
  id?: string;
  title: string;
  dek: string;
  slug: string;
  section_id: string;
  tag_ids: string[];
  author_ids: string[];
  hero_media_id: string | null;
  is_sponsored: boolean;
  comments_enabled: boolean;
  sponsor_name: string;
  sponsor_logo_media_id?: string | null;
  seo_title: string;
  seo_description: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  body_json: unknown;
  body_html?: string | null;
};

type Option = { id: string; name: string };
type MediaOption = { id: string; storage_path: string; alt: string | null };
type RevisionRow = { id: string; created_at: string; title: string | null };

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

// What the editor opens with: the stored JSON, else the stored (sanitized) HTML, else empty.
function initialContent(article: EditorArticle): { content: object | string; fromHtml: boolean } {
  if (article.body_json && typeof article.body_json === "object") return { content: article.body_json, fromHtml: false };
  if (article.body_html?.trim()) return { content: article.body_html, fromHtml: true };
  return { content: EMPTY_DOC, fromHtml: false };
}

function hasBodyContent(html: string | null | undefined) {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").trim().length > 0 || /<(img|iframe|figure|hr)\b/i.test(html);
}

const UNEXPECTED = "Something went wrong talking to the server. Your changes are still here; try again.";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ArticleEditor({
  article,
  sections,
  tags,
  people,
  media,
  revisions,
  previewHref,
  aiConfigured = false,
  mode = "editor",
}: {
  article: EditorArticle;
  sections: Option[];
  tags: Option[];
  people: Option[];
  media: MediaOption[];
  revisions: RevisionRow[];
  previewHref: string | null;
  // Whether the server has an Anthropic key and model; the assistant panel says so when it does not.
  aiConfigured?: boolean;
  // "contributor": save/submit only, own story, no publishing, sponsorship, authors, hero, images or restore.
  mode?: "editor" | "contributor";
}) {
  const isContributor = mode === "contributor";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(article);
  const [slugTouched, setSlugTouched] = useState(Boolean(article.id));
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(article.scheduled_for));
  const [result, setResult] = useState<Outcome | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [initial] = useState(() => initialContent(article));
  const [contentError, setContentError] = useState(false);
  // True when this article already has body text, so an empty editor must never overwrite it.
  const hadBody = hasBodyContent(article.body_html);

  const editor = useEditor({
    extensions: editorExtensions,
    content: initial.content,
    immediatelyRender: false,
    enableContentCheck: true,
    onContentError: () => setContentError(true),
    editorProps: { attributes: { class: "article-body min-h-[20rem] rounded border p-4 focus:outline-none", "aria-label": "Article body" } },
  });

  function update<K extends keyof EditorArticle>(key: K, value: EditorArticle[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: "tag_ids" | "author_ids", id: string) {
    setForm((current) => {
      const list = current[key];
      return { ...current, [key]: list.includes(id) ? list.filter((v) => v !== id) : [...list, id] };
    });
  }

  // A contributor can only edit a draft; anything already with the editors is read-only.
  const locked = isContributor && form.status !== "draft";
  const ready = Boolean(editor) && !contentError && !locked;

  useEffect(() => {
    editor?.setEditable(!locked);
  }, [editor, locked]);

  function submit(intent: SaveIntent | "submit") {
    if (!editor || contentError) return;
    if (hadBody && editor.isEmpty && !window.confirm("The body is empty. Saving will erase this article's existing text. Continue?")) {
      return;
    }
    setResult(null);
    startTransition(async () => {
      let outcome: Outcome;
      // ProseMirror attrs are null-prototype objects, which server actions
      // cannot read; send a plain JSON copy.
      const bodyJson = JSON.parse(JSON.stringify(editor.getJSON()));
      try {
        outcome = isContributor
          ? await saveContribution({
              id: form.id,
              intent: intent === "submit" ? "submit" : "save",
              title: form.title,
              dek: form.dek,
              slug: form.slug,
              section_id: form.section_id,
              tag_ids: form.tag_ids,
              seo_title: form.seo_title,
              seo_description: form.seo_description,
              body_json: bodyJson,
            })
          : await saveArticle({
        id: form.id,
        intent,
        title: form.title,
        dek: form.dek,
        slug: form.slug,
        section_id: form.section_id,
        tag_ids: form.tag_ids,
        author_ids: form.author_ids,
        hero_media_id: form.hero_media_id,
        is_sponsored: form.is_sponsored,
        comments_enabled: form.comments_enabled,
        sponsor_name: form.sponsor_name,
        sponsor_logo_media_id: form.sponsor_logo_media_id ?? null,
        seo_title: form.seo_title,
        seo_description: form.seo_description,
        scheduled_for: scheduleAt ? new Date(scheduleAt).toISOString() : null,
        body_json: bodyJson,
        });
      } catch {
        outcome = { ok: false, error: UNEXPECTED };
      }
      setResult(outcome);
      if (outcome.ok) {
        setForm((current) => ({ ...current, id: outcome.id, status: outcome.status }));
        setSlugTouched(true);
        if (!form.id) router.replace(isContributor ? `/contribute/${outcome.id}` : `/admin/articles/${outcome.id}`);
        else router.refresh();
      }
    });
  }

  function restore(revisionId: string) {
    if (!form.id || !window.confirm("Restore this revision? The current version stays in the history.")) return;
    startTransition(async () => {
      try {
        const outcome = await restoreRevision({ articleId: form.id, revisionId });
        setResult(outcome);
        if (outcome.ok) window.location.reload();
      } catch {
        setResult({ ok: false, error: UNEXPECTED });
      }
    });
  }

  // Insert blocks after a selected node (e.g. a just-inserted embed) instead of replacing it.
  function atCursor() {
    if (!editor) return null;
    const { selection } = editor.state;
    const chain = editor.chain().focus();
    return selection instanceof NodeSelection ? chain.setTextSelection(selection.to) : chain;
  }

  function addLink() {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (https://…)", previous ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function addYoutube() {
    const url = window.prompt("YouTube URL");
    if (url && editor && !atCursor()?.setYoutubeVideo({ src: url }).run()) {
      window.alert("That is not a YouTube URL.");
    }
  }

  function addEmbed() {
    const url = window.prompt("X or Instagram post URL");
    if (!url || !editor) return;
    if (!parseEmbedUrl(url)) return window.alert("Only x.com, twitter.com and instagram.com post URLs can be embedded.");
    atCursor()?.insertEmbed(url).run();
  }

  function addPoll() {
    const id = window.prompt("Poll ID (copy it from Admin → Polls)");
    if (!id || !editor) return;
    if (!atCursor()?.insertPoll(id).run()) window.alert("That is not a poll ID. Copy the ID shown next to the poll in Admin → Polls.");
  }

  function addImage(mediaId: string) {
    const item = media.find((m) => m.id === mediaId);
    if (item) atCursor()?.setImage({ src: mediaUrl(item.storage_path, { width: 1200 }), alt: item.alt ?? "" }).run();
  }

  const fieldError = (field: string) =>
    result && !result.ok && result.field === field ? (
      <span role="alert" className="text-xs text-red-600">
        {result.error}
        {field === "disclosure" ? (
          <>
            {" "}
            <Link href="/contribute/disclosure" className="underline">Add your disclosure</Link>
          </>
        ) : null}
      </span>
    ) : null;

  const tool = "rounded border px-2 py-1 text-sm disabled:opacity-40";
  const hero = media.find((m) => m.id === form.hero_media_id);

  return (
    <div className="flex flex-col gap-4 p-6 lg:flex-row">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            name="title"
            value={form.title}
            maxLength={200}
            onChange={(e) => {
              update("title", e.target.value);
              if (!slugTouched) update("slug", slugify(e.target.value));
            }}
            className="rounded border px-3 py-2 text-2xl font-bold"
          />
          {fieldError("title")}
        </label>

        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1">
          <button type="button" className={tool} onClick={() => editor?.chain().focus().toggleBold().run()}>Bold</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().toggleItalic().run()}>Italic</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().toggleBulletList().run()}>Bullets</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>Numbers</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>Quote</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().togglePullQuote().run()}>Pull quote</button>
          <button type="button" className={tool} onClick={addLink}>Link</button>
          <button type="button" className={tool} onClick={addYoutube}>YouTube</button>
          <button type="button" className={tool} onClick={addEmbed}>X / Instagram</button>
          {!isContributor ? <button type="button" className={tool} onClick={addPoll}>Poll</button> : null}
          {!isContributor ? (
            <select aria-label="Insert image" className={tool} value="" onChange={(e) => addImage(e.target.value)}>
              <option value="">Insert image…</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>{m.alt || m.storage_path}</option>
              ))}
            </select>
          ) : null}
          <button type="button" className={tool} onClick={() => editor?.chain().focus().undo().run()}>Undo</button>
          <button type="button" className={tool} onClick={() => editor?.chain().focus().redo().run()}>Redo</button>
        </div>

        {!editor ? <p className="text-sm opacity-70">Loading editor…</p> : null}
        {contentError ? (
          <p role="alert" className="rounded border border-red-600 p-2 text-sm">
            This article&apos;s stored body could not be loaded into the editor, so saving is disabled to protect it.
            Restore a revision or contact an admin.
          </p>
        ) : null}
        {initial.fromHtml && !contentError ? (
          <p role="status" className="rounded border border-yellow-600 p-2 text-sm">
            This body was loaded from its stored HTML. Check it before saving; anything the editor can&apos;t represent is dropped.
          </p>
        ) : null}
        <EditorContent editor={editor} />
        {fieldError("body")}

        {isContributor ? (
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" disabled={pending || !ready} onClick={() => submit("save")} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
              {form.id ? "Save" : "Save draft"}
            </button>
            <button type="button" disabled={pending || !ready} onClick={() => submit("submit")} className="rounded border px-4 py-2 disabled:opacity-50">
              Submit for review
            </button>
            {fieldError("disclosure")}
            {locked ? (
              <p role="status" className="text-sm opacity-80">
                This story is with the editors ({form.status}), so it can&apos;t be edited right now.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" disabled={pending || !ready} onClick={() => submit("save")} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
              {form.id ? "Save" : "Save draft"}
            </button>
            <button type="button" disabled={pending || !ready} onClick={() => submit("publish")} className="rounded border px-4 py-2 disabled:opacity-50">
              Publish now
            </button>
            <label className="flex flex-col gap-1 text-sm">
              Schedule for
              <input type="datetime-local" name="scheduled_for" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="rounded border px-2 py-1" />
            </label>
            <button type="button" disabled={pending || !ready || !scheduleAt} onClick={() => submit("schedule")} className="rounded border px-4 py-2 disabled:opacity-50">
              Schedule
            </button>
            {form.status === "published" || form.status === "scheduled" ? (
              <button type="button" disabled={pending || !ready} onClick={() => submit("unpublish")} className="rounded border px-4 py-2 disabled:opacity-50">
                Unpublish
              </button>
            ) : null}
            {fieldError("scheduled_for")}
          </div>
        )}

        <p className="text-sm">
          Status: <span data-testid="status">{form.status}</span>
          {form.id && previewHref && !isContributor ? (
            <>
              {" · "}
              <a href={previewHref} target="_blank" rel="noreferrer" className="underline">Preview</a>
            </>
          ) : null}
          {form.status === "published" ? (
            <>
              {" · "}
              <a href={`/articles/${form.slug}`} target="_blank" rel="noreferrer" className="underline">View live</a>
            </>
          ) : null}
        </p>
        {result?.ok ? (
          <p role="status" className="text-sm text-green-700">
            {result.status === "submitted" ? "Submitted for review." : "Saved."}
            {result.warning ? ` ${result.warning}` : ""}
          </p>
        ) : null}
        {result && !result.ok && !result.field ? <p role="alert" className="text-sm text-red-600">{result.error}</p> : null}
      </section>

      <aside className="flex w-full flex-col gap-3 text-sm lg:w-80">
        <label className="flex flex-col gap-1">
          Slug
          <input
            name="slug"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update("slug", e.target.value);
            }}
            className="rounded border px-2 py-1 font-mono"
          />
          {fieldError("slug")}
        </label>
        <label className="flex flex-col gap-1">
          Dek
          <textarea name="dek" value={form.dek} maxLength={400} rows={3} onChange={(e) => update("dek", e.target.value)} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Section
          <select name="section_id" value={form.section_id} onChange={(e) => update("section_id", e.target.value)} className="rounded border px-2 py-1">
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend>Tags</legend>
          {tags.length === 0 ? <span className="opacity-60">No tags yet.</span> : null}
          {tags.map((t) => (
            <label key={t.id} className="flex gap-2">
              <input type="checkbox" checked={form.tag_ids.includes(t.id)} onChange={() => toggle("tag_ids", t.id)} />
              {t.name}
            </label>
          ))}
        </fieldset>
        {!isContributor ? (
        <>
        <fieldset className="flex flex-col gap-1">
          <legend>Authors</legend>
          {people.map((p) => (
            <label key={p.id} className="flex gap-2">
              <input type="checkbox" checked={form.author_ids.includes(p.id)} onChange={() => toggle("author_ids", p.id)} />
              {p.name}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1">
          Hero image
          <select name="hero_media_id" value={form.hero_media_id ?? ""} onChange={(e) => update("hero_media_id", e.target.value || null)} className="rounded border px-2 py-1">
            <option value="">None</option>
            {media.map((m) => (
              <option key={m.id} value={m.id}>{m.alt || m.storage_path}</option>
            ))}
          </select>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
          {hero ? <img src={mediaUrl(hero.storage_path, { width: 400 })} alt={hero.alt ?? ""} className="rounded" /> : null}
        </label>
        </>
        ) : null}
        {!isContributor ? (
        <>
        <label className="flex gap-2">
          <input type="checkbox" name="comments_enabled" checked={form.comments_enabled} onChange={(e) => update("comments_enabled", e.target.checked)} />
          Allow reader comments (also needs the site-wide switch on Comments)
        </label>
        <label className="flex gap-2">
          <input type="checkbox" name="is_sponsored" checked={form.is_sponsored} onChange={(e) => update("is_sponsored", e.target.checked)} />
          Sponsored
        </label>
        {form.is_sponsored ? (
          <label className="flex flex-col gap-1">
            Sponsor name
            <input name="sponsor_name" value={form.sponsor_name} maxLength={120} onChange={(e) => update("sponsor_name", e.target.value)} className="rounded border px-2 py-1" />
          </label>
        ) : null}
        {form.is_sponsored ? (
          <label className="flex flex-col gap-1">
            Sponsor logo
            <select
              name="sponsor_logo_media_id"
              value={form.sponsor_logo_media_id ?? ""}
              onChange={(e) => update("sponsor_logo_media_id", e.target.value || null)}
              className="rounded border px-2 py-1"
            >
              <option value="">None</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>{m.alt || m.storage_path}</option>
              ))}
            </select>
            <span className="text-xs opacity-70">Shown beside the sponsored-content line. Upload logos in Media first.</span>
          </label>
        ) : null}
        {fieldError("sponsor_name")}
        </>
        ) : null}
        <label className="flex flex-col gap-1">
          SEO title
          <input name="seo_title" value={form.seo_title} maxLength={120} onChange={(e) => update("seo_title", e.target.value)} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          SEO description
          <textarea name="seo_description" value={form.seo_description} maxLength={320} rows={3} onChange={(e) => update("seo_description", e.target.value)} className="rounded border px-2 py-1" />
        </label>

        {!isContributor ? (
          <AiPanel
            articleId={form.id}
            configured={aiConfigured}
            editor={editor}
            tagIds={form.tag_ids}
            disabled={pending || !ready}
            onTitle={(value) => update("title", value)}
            onDek={(value) => update("dek", value)}
            onSeoTitle={(value) => update("seo_title", value)}
            onSeoDescription={(value) => update("seo_description", value)}
            onAddTags={(ids) => ids.forEach((id) => toggle("tag_ids", id))}
          />
        ) : null}

        {form.id && !isContributor ? (
          <div className="flex flex-col gap-2 border-t pt-3">
            <button type="button" onClick={() => setShowRevisions((v) => !v)} className="self-start underline" aria-expanded={showRevisions}>
              Revisions ({revisions.length})
            </button>
            {showRevisions ? (
              <ol className="flex flex-col gap-2" aria-label="Revisions">
                {revisions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span>
                      {new Date(r.created_at).toLocaleString()} — {r.title ?? "Untitled"}
                    </span>
                    <button type="button" disabled={pending || !ready} onClick={() => restore(r.id)} className="rounded border px-2 py-0.5 disabled:opacity-50">
                      Restore
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
