import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { toCsv } from "@/lib/contests/draw";

export const dynamic = "force-dynamic";

// Editors only, through their own client (RLS). Personal data: never cached.
export async function GET(_request: Request, { params }: RouteContext<"/admin/contests/[id]/entries.csv">) {
  const ctx = await getEditorContext();
  if (!ctx) return new Response("Not found", { status: 404 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const { data: contest } = await ctx.supabase.from("contests").select("slug").eq("id", id).maybeSingle<{ slug: string }>();
  if (!contest) return new Response("Not found", { status: 404 });
  const { data } = await ctx.supabase
    .from("contest_entries")
    .select("id, name, email, answer, consent_at, created_at")
    .eq("contest_id", id)
    .order("id")
    .limit(100000)
    .returns<{ id: string; name: string; email: string; answer: string | null; consent_at: string; created_at: string }[]>();
  const body = toCsv(
    ["entry_id", "name", "email", "answer", "consent_at", "entered_at"],
    (data ?? []).map((row) => [row.id, row.name, row.email, row.answer, row.consent_at, row.created_at]),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${contest.slug}-entries.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
