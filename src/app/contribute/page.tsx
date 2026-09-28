import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { EditorsGoToAdmin } from "./editors-note";

const GROUPS = [
  { status: "draft", label: "Drafts" },
  { status: "submitted", label: "Submitted" },
  { status: "in_review", label: "In review" },
  { status: "scheduled", label: "Scheduled" },
  { status: "published", label: "Published" },
] as const;

type Row = { id: string; title: string; slug: string; status: string; updated_at: string };
type Note = { article_id: string; body: string; created_at: string };

export default async function ContributeDashboard() {
  const { supabase, user, profile } = await requireArea("contribute");
  if (profile?.role !== "contributor") return <EditorsGoToAdmin />;

  const [{ data: articles }, { data: disclosure }] = await Promise.all([
    supabase
      .from("articles")
      .select("id, title, slug, status, updated_at, article_authors!inner(profile_id)")
      .eq("article_authors.profile_id", user.id)
      .order("updated_at", { ascending: false })
      .returns<Row[]>(),
    supabase.from("disclosures").select("id").eq("profile_id", user.id).maybeSingle(),
  ]);

  const rows = articles ?? [];
  const ids = rows.map((r) => r.id);
  const { data: notes } = ids.length
    ? await supabase
        .from("editorial_notes")
        .select("article_id, body, created_at")
        .in("article_id", ids)
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .returns<Note[]>()
    : { data: [] as Note[] };
  const latestNote = new Map<string, Note>();
  for (const note of notes ?? []) if (!latestNote.has(note.article_id)) latestNote.set(note.article_id, note);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Contributor desk</h1>
        <Link href="/contribute/new" className="rounded bg-foreground px-3 py-1 text-background">
          New story
        </Link>
      </div>

      {!disclosure ? (
        <p role="status" className="rounded border border-yellow-600 p-3 text-sm">
          You need a disclosure before you can submit a story.{" "}
          <Link href="/contribute/disclosure" className="underline">Add your disclosure</Link>
        </p>
      ) : (
        <p className="text-sm">
          <Link href="/contribute/disclosure" className="underline">Edit your disclosure</Link>
        </p>
      )}

      {GROUPS.map((group) => {
        const items = rows.filter((r) => r.status === group.status);
        return (
          <section key={group.status} className="flex flex-col gap-2" aria-labelledby={`group-${group.status}`}>
            <h2 id={`group-${group.status}`} className="text-xl font-semibold">
              {group.label} ({items.length})
            </h2>
            {items.length === 0 ? <p className="text-sm opacity-60">Nothing here.</p> : null}
            <ul className="flex flex-col gap-2">
              {items.map((row) => {
                const note = latestNote.get(row.id);
                return (
                  <li key={row.id} className="rounded border p-3">
                    <Link href={row.status === "published" ? `/articles/${row.slug}` : `/contribute/${row.id}`} className="font-medium underline">
                      {row.title}
                    </Link>
                    <span className="ml-2 text-xs opacity-60">updated {new Date(row.updated_at).toISOString().slice(0, 10)}</span>
                    {note ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm">
                        <span className="font-semibold">Editor note:</span> {note.body}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
