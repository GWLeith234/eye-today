import Link from "next/link";
import { notFound } from "next/navigation";

import { requireArea } from "@/lib/auth/session";
import { sourceLines } from "@/lib/directory/sources";
import { isTrackerKind, keyDateLines } from "@/lib/tracker/model";

import { deleteTrackerEntry } from "../actions";
import { storyChoices } from "../choices";
import { EntryForm } from "../entry-form";

type Row = {
  id: string; slug: string; kind: string; title: string; sponsor: string; stage: string; amount: string; jurisdiction: string;
  key_dates: unknown; links: unknown; notes: string; article_id: string | null; last_reviewed: string | null; status: "draft" | "published"; sort: number;
};

export default async function EditTrackerEntryPage({ params, searchParams }: PageProps<"/admin/tracker/[id]">) {
  const { id } = await params;
  const { supabase } = await requireArea("admin");
  const query = await searchParams;
  const { data } = await supabase
    .from("tracker_entries")
    .select("id, slug, kind, title, sponsor, stage, amount, jurisdiction, key_dates, links, notes, article_id, last_reviewed, status, sort")
    .eq("id", id)
    .maybeSingle<Row>();
  if (!data) notFound();
  const stories = await storyChoices(supabase, data.article_id);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <Link href="/admin/tracker" className="underline">← Tracker</Link> · <Link href="/tracker" className="underline">View public page</Link>
      </p>
      <h1 className="text-2xl font-semibold">Edit entry</h1>
      <EntryForm
        values={{
          ...data,
          kind: isTrackerKind(data.kind) ? data.kind : "trial",
          key_dates: keyDateLines(data.key_dates),
          links: sourceLines(data.links),
          article_id: data.article_id ?? "",
          last_reviewed: data.last_reviewed ?? "",
        }}
        stories={stories}
        notice={query.saved === "1" ? "Saved." : undefined}
      />
      <form action={deleteTrackerEntry} className="max-w-3xl border-t border-rule pt-4">
        <input type="hidden" name="id" value={data.id} />
        <button type="submit" className="rounded border border-red-600 px-3 py-1.5 text-sm text-red-700">Delete entry</button>
      </form>
    </div>
  );
}
