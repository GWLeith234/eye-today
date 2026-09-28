import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

type Row = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  article_authors: { profiles: { display_name: string | null } | null }[];
};

export default async function ReviewQueuePage() {
  const { supabase } = await requireArea("admin");
  const { data } = await supabase
    .from("articles")
    .select("id, title, status, updated_at, article_authors(profiles(display_name))")
    .in("status", ["submitted", "in_review"])
    .order("updated_at", { ascending: false })
    .returns<Row[]>();

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Review queue</h1>
      {(data ?? []).length === 0 ? <p className="text-sm opacity-70">Nothing waiting for review.</p> : null}
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="py-1">Story</th>
            <th className="py-1">By</th>
            <th className="py-1">Status</th>
            <th className="py-1">Updated</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((row) => (
            <tr key={row.id} className="border-t">
              <td className="py-1">
                <Link href={`/admin/review/${row.id}`} className="underline">{row.title}</Link>
              </td>
              <td className="py-1">{row.article_authors.map((a) => a.profiles?.display_name ?? "Unnamed").join(", ") || "—"}</td>
              <td className="py-1">{row.status}</td>
              <td className="py-1">{new Date(row.updated_at).toISOString().slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
