"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { postComment, reportComment } from "@/lib/comments/actions";

type Published = { id: string; parent_id: string | null; body: string; created_at: string; display_name: string; is_supporter: boolean };
type Mine = { id: string; parent_id: string | null; body: string; created_at: string; status: string; reject_reason: string | null };
type Payload = { open: boolean; signedIn: boolean; comments: Published[]; mine: Mine[] };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

function Composer({ articleId, parentId, signedInLabel, onPosted, onCancel }: {
  articleId: string;
  parentId: string | null;
  signedInLabel: string;
  onPosted: () => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await postComment({ articleId, parentId, body });
          setNote(result);
          if (result.ok) {
            setBody("");
            onPosted();
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">{signedInLabel}</span>
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          maxLength={1000}
          rows={parentId ? 3 : 4}
          className="border border-rule bg-paper p-2 text-base text-ink"
        />
      </label>
      {note ? <p role={note.ok ? "status" : "alert"} className="text-sm">{note.message}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !body.trim()} className="bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50">
          {pending ? "Posting…" : parentId ? "Post reply" : "Post comment"}
        </button>
        {onCancel ? <button type="button" onClick={onCancel} className="border border-rule px-4 py-2 text-sm">Cancel</button> : null}
      </div>
    </form>
  );
}

function Report({ commentId }: { commentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (note) return <span role="status" className="text-xs">{note}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs underline">Report</button>;
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => setNote((await reportComment({ commentId, reason })).message));
      }}
    >
      <input aria-label="Why are you reporting this comment?" value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} placeholder="What is wrong?" className="border border-rule bg-paper px-2 py-1" />
      <button type="submit" disabled={pending} className="underline">Send report</button>
    </form>
  );
}

// Body is rendered as text: React escapes it, nothing is linked, line breaks are kept.
function Body({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words">{text}</p>;
}

export function Comments({ articleId }: { articleId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/comments?article=${articleId}`, { cache: "no-store", credentials: "same-origin" });
      if (response.ok) setData((await response.json()) as Payload);
    } catch {
      // Leave whatever is on screen.
    }
  }, [articleId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of private, uncached data
    void load();
  }, [load]);

  if (!data || !data.open) return null;

  const top = data.comments.filter((c) => c.parent_id === null);
  const replies = (id: string) => data.comments.filter((c) => c.parent_id === id);
  const mineTop = data.mine.filter((c) => c.parent_id === null);
  const mineReplies = (id: string) => data.mine.filter((c) => c.parent_id === id);

  const mineView = (c: Mine) => (
    <li key={c.id} className="flex flex-col gap-1 border border-rule bg-paper p-3 text-sm">
      {c.status === "pending" ? <p className="text-xs font-semibold uppercase tracking-widest">Held for review</p> : null}
      {c.status === "rejected" ? (
        <p className="text-xs font-semibold uppercase tracking-widest">Not published{c.reject_reason ? `: ${c.reject_reason}` : ""}</p>
      ) : null}
      <Body text={c.body} />
    </li>
  );

  return (
    <section id="comments" aria-labelledby="comments-heading" className="mx-auto flex w-full max-w-3xl flex-col gap-4 border-t-2 border-ink pt-4">
      <h2 id="comments-heading" className="font-display text-2xl font-semibold">Comments</h2>

      {data.signedIn ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            This is not a place for personal medical advice. Read our{" "}
            <Link href="/community-guidelines" className="underline">community guidelines</Link>.
          </p>
          <Composer articleId={articleId} parentId={null} signedInLabel="Add a comment" onPosted={load} />
        </div>
      ) : (
        <p className="text-sm">
          <Link href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`} className="underline">Sign in</Link>{" "}
          to join the conversation. Read our <Link href="/community-guidelines" className="underline">community guidelines</Link>.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {mineTop.map(mineView)}
        {top.map((c) => (
          <li key={c.id} className="flex flex-col gap-2">
            <article className="flex flex-col gap-1 text-sm">
              <p className="font-semibold">
                {c.display_name}
                {c.is_supporter ? <span className="ml-2 border border-rule px-1 text-xs font-normal uppercase tracking-widest">Supporter</span> : null}
                <time dateTime={c.created_at} className="ml-2 text-xs font-normal opacity-70">{when(c.created_at)}</time>
              </p>
              <Body text={c.body} />
              {data.signedIn ? (
                <div className="flex gap-3">
                  <button type="button" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="text-xs underline">Reply</button>
                  <Report commentId={c.id} />
                </div>
              ) : null}
            </article>
            {replyTo === c.id ? (
              <div className="ml-6">
                <Composer articleId={articleId} parentId={c.id} signedInLabel={`Reply to ${c.display_name}`} onPosted={() => { setReplyTo(null); void load(); }} onCancel={() => setReplyTo(null)} />
              </div>
            ) : null}
            <ul className="ml-6 flex flex-col gap-3 border-l border-rule pl-4">
              {mineReplies(c.id).map(mineView)}
              {replies(c.id).map((r) => (
                <li key={r.id} className="flex flex-col gap-1 text-sm">
                  <p className="font-semibold">
                    {r.display_name}
                    {r.is_supporter ? <span className="ml-2 border border-rule px-1 text-xs font-normal uppercase tracking-widest">Supporter</span> : null}
                    <time dateTime={r.created_at} className="ml-2 text-xs font-normal opacity-70">{when(r.created_at)}</time>
                  </p>
                  <Body text={r.body} />
                  {data.signedIn ? <Report commentId={r.id} /> : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {top.length === 0 && mineTop.length === 0 ? <p className="text-sm opacity-70">No comments yet.</p> : null}
    </section>
  );
}
