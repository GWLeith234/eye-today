import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { TRACKER_KIND_SINGULAR, isTrackerKind } from "@/lib/tracker/model";

type Row = { id: string; slug: string; kind: string; title: string; sponsor: string; stage: string; status: string; last_reviewed: string | null };

export default async function TrackerAdminPage({ searchParams }: PageProps<"/admin/tracker">) {
  const { supabase } = await requireArea("admin");
  const query = await searchParams;
  const { data: entries } = await supabase
    .from("tracker_entries")
    .select("id, slug, kind, title, sponsor, stage, status, last_reviewed")
    .order("kind")
    .order("sort")
    .order("title")
    .limit(500)
    .returns<Row[]>();
  const done = query.done === "deleted" ? "Entry removed." : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Trials &amp; Funding Tracker</h1>
        <Link href="/admin/tracker/new" className="rounded bg-ink px-3 py-1.5 text-sm text-paper">New entry</Link>
      </div>
      <p className="text-sm">Trials, funding programmes and regulatory actions, each with its dates, sources and our story. Readers see it at <code>/tracker</code>.</p>
      {done ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{done}</p> : null}
      {(entries ?? []).length === 0 ? <p className="text-sm">No entries yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {(entries ?? []).map((entry) => (
          <li key={entry.id} data-tracker-row={entry.slug} className="flex flex-wrap items-baseline gap-3 border border-rule p-3 text-sm">
            <span className="rounded border border-rule px-2 text-xs">{isTrackerKind(entry.kind) ? TRACKER_KIND_SINGULAR[entry.kind] : entry.kind}</span>
            <Link href={`/admin/tracker/${entry.id}`} className="font-semibold underline">{entry.title}</Link>
            <span className="text-muted">{[entry.sponsor, entry.stage].filter(Boolean).join(" · ")}</span>
            <span className="rounded border border-rule px-2 text-xs">{entry.status === "published" ? "Published" : "Draft"}</span>
            <span className="ml-auto text-xs text-muted">{entry.last_reviewed ? `Reviewed ${entry.last_reviewed}` : "Not reviewed"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
