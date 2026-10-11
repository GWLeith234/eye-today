import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { issueLabel } from "@/lib/editions/model";

type Row = { id: string; slug: string; title: string; issue_month: string; status: string; public_from: string | null; supporters_from: string | null; pdf_generated_at: string | null };

function state(row: Row): string {
  if (row.status !== "published") return "Draft";
  const now = new Date().toISOString();
  if (row.public_from && row.public_from <= now) return "Live";
  if (row.supporters_from && row.supporters_from <= now) return "Supporters only";
  return "Scheduled";
}

export default async function EditionsAdminPage() {
  const { supabase } = await requireArea("admin");
  const { data: editions } = await supabase
    .from("editions")
    .select("id, slug, title, issue_month, status, public_from, supporters_from, pdf_generated_at")
    .order("issue_month", { ascending: false })
    .limit(200)
    .returns<Row[]>();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Editions</h1>
        <Link href="/admin/editions/new" className="rounded bg-ink px-3 py-1.5 text-sm text-paper">New edition</Link>
      </div>
      <p className="text-sm">A monthly issue built from published stories. Readers page through it at <code>/editions</code> and can download the PDF.</p>
      {(editions ?? []).length === 0 ? <p className="text-sm">No editions yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {(editions ?? []).map((edition) => (
          <li key={edition.id} data-edition-row={edition.slug} className="flex flex-wrap items-baseline gap-3 border border-rule p-3 text-sm">
            <Link href={`/admin/editions/${edition.id}`} className="font-semibold underline">{edition.title}</Link>
            <span className="text-muted">{issueLabel(edition.issue_month)}</span>
            <span className="rounded border border-rule px-2 text-xs">{state(edition)}</span>
            <span className="text-xs text-muted">{edition.pdf_generated_at ? "PDF ready" : "No PDF"}</span>
            <Link href={`/editions/${edition.slug}`} className="ml-auto text-xs underline">View</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
