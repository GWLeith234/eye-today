import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { toCsv } from "@/lib/contests/draw";

export const dynamic = "force-dynamic";

const PAGE = 1000;

// Editors only, through their own client (RLS). Personal data: never cached.
export async function GET(_request: Request, { params }: RouteContext<"/admin/contests/[id]/entries.csv">) {
  const ctx = await getEditorContext();
  if (!ctx) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const { data: contest } = await ctx.supabase.from("contests").select("slug").eq("id", id).maybeSingle<{ slug: string }>();
  if (!contest) return new Response("Not found", { status: 404 });
  // The Data API returns at most 1000 rows per request, so page through every entry.
  type Entry = { id: string; name: string; email: string; answer: string | null; consent_at: string; created_at: string };
  const rows: Entry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase
      .from("contest_entries")
      .select("id, name, email, answer, consent_at, created_at")
      .eq("contest_id", id)
      .order("id")
      .range(from, from + PAGE - 1)
      .returns<Entry[]>();
    if (error) return new Response("Export failed", { status: 500, headers: { "Cache-Control": "no-store" } });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const body = toCsv(
    ["entry_id", "name", "email", "answer", "consent_at", "entered_at"],
    rows.map((row) => [row.id, row.name, row.email, row.answer, row.consent_at, row.created_at]),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${contest.slug}-entries.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
