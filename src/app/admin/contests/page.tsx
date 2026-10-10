import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

type Row = { id: string; slug: string; title: string; status: string; closes_at: string };

export default async function ContestsAdminPage() {
  const { supabase } = await requireArea("admin");
  const { data } = await supabase.from("contests").select("id, slug, title, status, closes_at").order("closes_at", { ascending: false }).limit(200).returns<Row[]>();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Contests</h1>
        <Link href="/admin/contests/new" className="rounded bg-ink px-3 py-1.5 text-sm text-paper">New contest</Link>
      </div>
      {(data ?? []).length === 0 ? <p className="text-sm">No contests yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((row) => (
          <li key={row.id} className="border border-rule p-3 text-sm">
            <Link href={`/admin/contests/${row.id}`} className="font-semibold underline">{row.title}</Link>
            <span className="ml-2 text-muted">{row.status} · closes {new Date(row.closes_at).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
