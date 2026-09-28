import Link from "next/link";
import { notFound } from "next/navigation";

import { requireArea } from "@/lib/auth/session";
import { sanitizeArticleHtml } from "@/lib/editor/sanitize";

import { publishNow, requestChanges, resolveNote, startReview } from "../actions";
import { ScheduleForm } from "./schedule-form";

const DONE: Record<string, string> = {
  in_review: "Review started.",
  changes: "Changes requested. The story is back with its author as a draft.",
  scheduled: "Approved and scheduled.",
  published: "Published.",
  resolved: "Note resolved.",
};

const ERRORS: Record<string, string> = {
  moved: "That story is no longer waiting for this step (someone may have acted on it already).",
  note_required: "Write a note for the author (up to 4000 characters).",
  note_failed: "The note could not be saved.",
  schedule_invalid: "Pick a date and time.",
  schedule_past: "Schedule a time in the future, or publish now.",
};

type Article = {
  id: string;
  title: string;
  dek: string | null;
  slug: string;
  status: string;
  body_html: string | null;
  article_authors: { sort: number; profile_id: string; profiles: { display_name: string | null } | null }[];
};
type Disclosure = { profile_id: string; text: string };
type Note = { id: string; body: string; resolved: boolean; created_at: string; profiles: { display_name: string | null } | null };

export default async function ReviewStoryPage({ params, searchParams }: PageProps<"/admin/review/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;

  const { data: article } = await supabase
    .from("articles")
    .select("id, title, dek, slug, status, body_html, article_authors(sort, profile_id, profiles(display_name))")
    .eq("id", id)
    .maybeSingle<Article>();
  if (!article) notFound();

  const authorIds = article.article_authors.map((a) => a.profile_id);
  const [{ data: disclosures }, { data: notes }] = await Promise.all([
    authorIds.length
      ? supabase.from("disclosures").select("profile_id, text").in("profile_id", authorIds).returns<Disclosure[]>()
      : Promise.resolve({ data: [] as Disclosure[] }),
    supabase
      .from("editorial_notes")
      .select("id, body, resolved, created_at, profiles(display_name)")
      .eq("article_id", id)
      .order("created_at", { ascending: true })
      .returns<Note[]>(),
  ]);
  const disclosureFor = new Map((disclosures ?? []).map((d) => [d.profile_id, d.text]));
  const reviewable = article.status === "submitted" || article.status === "in_review";
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;

  return (
    <main className="flex flex-col gap-6 p-6 lg:flex-row">
      <article className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sm">
          <Link href="/admin/review" className="underline">Review queue</Link> · status: <span data-testid="status">{article.status}</span>
          {" · "}
          <Link href={`/admin/articles/${article.id}`} className="underline">Open in editor</Link>
        </p>
        {done ? (
          <p role="status" className="rounded border border-green-600 p-2 text-sm">
            {done}
            {query.warning === "mail" ? " Email notifications could not be sent." : ""}
          </p>
        ) : null}
        {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}
        <h1 className="text-3xl font-bold">{article.title}</h1>
        {article.dek ? <p className="text-lg opacity-80">{article.dek}</p> : null}
        <section aria-label="Byline" className="flex flex-col gap-1 text-sm">
          {[...article.article_authors].sort((a, b) => a.sort - b.sort).map((a) => (
            <p key={a.profile_id}>
              <span className="font-semibold">{a.profiles?.display_name ?? "Unnamed"}</span>
              {" — "}
              <span className="whitespace-pre-wrap">{disclosureFor.get(a.profile_id) ?? "No disclosure on file."}</span>
            </p>
          ))}
        </section>
        <div className="article-body flex flex-col gap-4 border-t pt-4" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.body_html ?? "") }} />
      </article>

      <aside className="flex w-full flex-col gap-4 text-sm lg:w-96">
        {reviewable ? (
          <section className="flex flex-col gap-3 rounded border p-3" aria-label="Review actions">
            {article.status === "submitted" ? (
              <form action={startReview}>
                <input type="hidden" name="id" value={article.id} />
                <button type="submit" className="rounded border px-3 py-1">Start review</button>
              </form>
            ) : null}
            <form action={requestChanges} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={article.id} />
              <label className="flex flex-col gap-1">
                Note to the author
                <textarea name="note" required maxLength={4000} rows={4} className="rounded border px-2 py-1" />
              </label>
              <button type="submit" className="self-start rounded border px-3 py-1">Request changes</button>
            </form>
            <ScheduleForm id={article.id} />
            <form action={publishNow}>
              <input type="hidden" name="id" value={article.id} />
              <button type="submit" className="rounded bg-foreground px-3 py-1 text-background">Publish</button>
            </form>
          </section>
        ) : (
          <p className="opacity-70">This story is not waiting for review.</p>
        )}

        <section className="flex flex-col gap-2" aria-label="Notes">
          <h2 className="font-semibold">Notes</h2>
          {(notes ?? []).length === 0 ? <p className="opacity-60">No notes yet.</p> : null}
          <ol className="flex flex-col gap-2">
            {(notes ?? []).map((note) => (
              <li key={note.id} className={`rounded border p-2 ${note.resolved ? "opacity-60" : ""}`}>
                <p className="text-xs opacity-60">
                  {note.profiles?.display_name ?? "Editor"} · {new Date(note.created_at).toLocaleString()}
                  {note.resolved ? " · resolved" : ""}
                </p>
                <p className="whitespace-pre-wrap">{note.body}</p>
                {!note.resolved ? (
                  <form action={resolveNote}>
                    <input type="hidden" name="id" value={article.id} />
                    <input type="hidden" name="note" value={note.id} />
                    <button type="submit" className="text-xs underline">Mark resolved</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </main>
  );
}
