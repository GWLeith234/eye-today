"use client";

import type { Editor } from "@tiptap/react";
import { useState, useTransition } from "react";

import { chromeForNewRun, locateQuote } from "@/lib/ai/quotes";
import type { Claims, CopyEdit, Dek, Headlines, Seo, Summary } from "@/lib/ai/schemas";

import {
  type AcceptResult,
  acceptSuggestion,
  claimsCheck,
  copyEdit,
  suggestDek,
  suggestHeadlines,
  suggestSeo,
  suggestSummary,
  suggestTags,
  type TagsOutput,
} from "./ai-actions";

type Run =
  | { kind: "headlines"; id: string; output: Headlines }
  | { kind: "dek"; id: string; output: Dek }
  | { kind: "seo"; id: string; output: Seo }
  | { kind: "tags"; id: string; output: TagsOutput }
  | { kind: "copy_edit"; id: string; output: CopyEdit }
  | { kind: "claims"; id: string; output: Claims }
  | { kind: "summary"; id: string; output: Summary };

type Stamp = { model: string; promptVersion: string };

const UNEXPECTED = "The assistant is unavailable. Nothing was changed.";
const COULD_NOT_APPLY = "Couldn't apply that. Edit it by hand.";
const GAP = "￼";

// The text of each textblock with one character per document position, so an index in the
// string maps straight to a position. Blocks with anything but text and leaf nodes are skipped.
function blockTexts(editor: Editor): { start: number; text: string }[] {
  const blocks: { start: number; text: string }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    let plain = true;
    node.forEach((child) => {
      if (child.isText) text += child.text ?? "";
      else if (child.isLeaf) text += GAP;
      else plain = false;
    });
    if (plain) blocks.push({ start: pos + 1, text });
    return false;
  });
  return blocks;
}

// Replace the quote only when the body has one folded match. The original characters
// (including a non-breaking space) are what get replaced; the suggestion is inserted as given.
function replaceOnce(editor: Editor, quote: string, replacement: string): boolean {
  if (!locateQuote(editor.getText(), quote)) return false;
  const hits = blockTexts(editor).flatMap((b) => {
    const hit = locateQuote(b.text, quote);
    return hit ? [{ from: b.start + hit.start, to: b.start + hit.end }] : [];
  });
  if (hits.length !== 1) return false;
  editor.view.dispatch(editor.state.tr.insertText(replacement, hits[0].from, hits[0].to));
  return true;
}

const button = "rounded border px-2 py-1 text-sm disabled:opacity-40";

export function AiPanel({
  articleId,
  configured,
  editor,
  tagIds,
  disabled,
  onTitle,
  onDek,
  onSeoTitle,
  onSeoDescription,
  onAddTags,
}: {
  articleId: string | undefined;
  configured: boolean;
  editor: Editor | null;
  tagIds: string[];
  disabled: boolean;
  onTitle: (value: string) => void;
  onDek: (value: string) => void;
  onSeoTitle: (value: string) => void;
  onSeoDescription: (value: string) => void;
  onAddTags: (ids: string[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [stamp, setStamp] = useState<Stamp | null>(null);

  const busy = pending || disabled;

  function start(action: (id: string) => Promise<{ ok: false; error: string } | ({ ok: true; suggestionId: string; kind: Run["kind"]; output: unknown })>) {
    if (!articleId) return;
    const fresh = chromeForNewRun();
    setError(fresh.error);
    setNotes(fresh.notes);
    setRun(fresh.run);
    setStamp(fresh.stamp);
    startTransition(async () => {
      try {
        const result = await action(articleId);
        if (!result.ok) setError(result.error);
        else setRun({ kind: result.kind, id: result.suggestionId, output: result.output } as Run);
      } catch {
        setError(UNEXPECTED);
      }
    });
  }

  // Mark the run accepted. The article itself is only ever changed by the caller, before this.
  async function markAccepted(id: string): Promise<boolean> {
    let result: AcceptResult;
    try {
      result = await acceptSuggestion(id);
    } catch {
      result = { ok: false, error: UNEXPECTED };
    }
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setStamp({ model: result.model, promptVersion: result.promptVersion });
    return true;
  }

  function accept(id: string, apply?: () => void) {
    startTransition(async () => {
      apply?.();
      await markAccepted(id);
    });
  }

  function applyCopyEdit(index: number, item: CopyEdit["items"][number], id: string) {
    if (!editor) return;
    startTransition(async () => {
      if (!replaceOnce(editor, item.quote, item.suggestion)) {
        setNotes((n) => ({ ...n, [`c${index}`]: COULD_NOT_APPLY }));
        return;
      }
      setNotes((n) => ({ ...n, [`c${index}`]: "Applied. Save to keep it." }));
      await markAccepted(id);
    });
  }

  const dismiss = (
    <button type="button" className={button} disabled={busy} onClick={() => setRun(null)}>
      Dismiss
    </button>
  );

  return (
    <section aria-label="AI assistant" className="flex flex-col gap-2 border-t pt-3">
      <h2 className="font-semibold">Assistant</h2>
      {!configured ? (
        <p role="status">The assistant is not configured.</p>
      ) : !articleId ? (
        <p role="status">Save the draft before asking the assistant.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            <button type="button" className={button} disabled={busy} onClick={() => start(suggestHeadlines)}>Headlines</button>
            <button type="button" className={button} disabled={busy} onClick={() => start(suggestDek)}>Dek</button>
            <button type="button" className={button} disabled={busy} onClick={() => start(suggestSeo)}>SEO</button>
            <button type="button" className={button} disabled={busy} onClick={() => start(suggestTags)}>Tags</button>
            <button type="button" className={button} disabled={busy} onClick={() => start(copyEdit)}>Copy edit</button>
            <button type="button" className={button} disabled={busy} onClick={() => start(claimsCheck)}>Claims</button>
            <button type="button" className={button} disabled={busy} onClick={() => start(suggestSummary)}>Key points</button>
          </div>
          {pending ? <p role="status">Asking the assistant…</p> : null}
          {error ? <p role="alert" className="text-red-600">{error}</p> : null}
          {stamp ? (
            <p role="status" className="text-xs opacity-80">
              {stamp.model} · {stamp.promptVersion} · Accepted by you
            </p>
          ) : null}
          <p className="text-xs opacity-70">Suggestions are drafts. Nothing changes until you accept one and press Save.</p>

          {run?.kind === "headlines" ? (
            <ol className="flex flex-col gap-2" aria-label="Headline suggestions">
              {run.output.headlines.map((h) => (
                <li key={h} className="flex flex-col gap-1">
                  <span>{h}</span>
                  <span className="flex gap-1">
                    <button type="button" className={button} disabled={busy} onClick={() => accept(run.id, () => onTitle(h))}>Accept</button>
                  </span>
                </li>
              ))}
              <li>{dismiss}</li>
            </ol>
          ) : null}

          {run?.kind === "dek" ? (
            <div className="flex flex-col gap-1">
              <p>{run.output.dek}</p>
              <span className="flex gap-1">
                <button type="button" className={button} disabled={busy} onClick={() => accept(run.id, () => onDek(run.output.dek))}>Accept</button>
                {dismiss}
              </span>
            </div>
          ) : null}

          {run?.kind === "seo" ? (
            <div className="flex flex-col gap-2">
              <p><strong>SEO title:</strong> {run.output.seo_title}</p>
              <p><strong>SEO description:</strong> {run.output.seo_description}</p>
              <span className="flex flex-wrap gap-1">
                <button type="button" className={button} disabled={busy} onClick={() => accept(run.id, () => onSeoTitle(run.output.seo_title))}>Accept title</button>
                <button type="button" className={button} disabled={busy} onClick={() => accept(run.id, () => onSeoDescription(run.output.seo_description))}>Accept description</button>
                {dismiss}
              </span>
            </div>
          ) : null}

          {run?.kind === "tags" ? (
            <div className="flex flex-col gap-1">
              {run.output.tags.length === 0 ? <p>No matching tags on this site.</p> : <p>{run.output.tags.map((t) => t.name).join(", ")}</p>}
              <span className="flex gap-1">
                {run.output.tags.length > 0 ? (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => accept(run.id, () => onAddTags(run.output.tags.map((t) => t.id).filter((id) => !tagIds.includes(id))))}
                  >
                    Accept
                  </button>
                ) : null}
                {dismiss}
              </span>
            </div>
          ) : null}

          {run?.kind === "copy_edit" ? (
            <div className="flex flex-col gap-2">
              {run.output.items.length === 0 ? <p>No changes suggested.</p> : null}
              <ul className="flex flex-col gap-2">
                {run.output.items.map((item, i) => (
                  <li key={`${i}-${item.quote}`} className="flex flex-col gap-1 rounded border p-2">
                    <span>“{item.quote}” → “{item.suggestion}”</span>
                    <span className="text-xs opacity-80">{item.reason}</span>
                    <span className="flex items-center gap-2">
                      <button type="button" className={button} disabled={busy || !editor} onClick={() => applyCopyEdit(i, item, run.id)}>Accept</button>
                      {notes[`c${i}`] ? <span role="status" className="text-xs">{notes[`c${i}`]}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              <span>{dismiss}</span>
            </div>
          ) : null}

          {run?.kind === "claims" ? (
            <div className="flex flex-col gap-2">
              {run.output.items.length === 0 ? <p>No claims flagged.</p> : null}
              <ul className="flex flex-col gap-2">
                {run.output.items.map((item, i) => (
                  <li key={`${i}-${item.sentence}`} className="rounded border p-2">
                    <strong className="uppercase">{item.kind}</strong>: {item.sentence}
                    <br />
                    <span className="text-xs opacity-80">{item.reason}</span>
                  </li>
                ))}
              </ul>
              <span className="flex gap-1">
                <button type="button" className={button} disabled={busy} onClick={() => accept(run.id)}>Mark reviewed</button>
                {dismiss}
              </span>
            </div>
          ) : null}

          {run?.kind === "summary" ? (
            <div className="flex flex-col gap-2">
              <ul className="list-disc pl-5">
                {run.output.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <span className="flex gap-1">
                <button type="button" className={button} disabled={busy} onClick={() => accept(run.id)}>Accept</button>
                {dismiss}
              </span>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
