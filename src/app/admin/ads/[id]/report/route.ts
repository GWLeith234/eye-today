import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";

export const dynamic = "force-dynamic";

const PAGE = 1000;
const MAX_ROWS = 100_000;

// Every recorded event for one campaign as CSV: when, which creative, which slot, impression or click.
// Editors only, checked here because this is a route handler, not a page.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getEditorContext();
  if (!ctx) return new Response("Only editors can download reports.", { status: 401 });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });

  const { data: creatives } = await ctx.supabase.from("ad_creatives").select("id").eq("campaign_id", id.data);
  const ids = ((creatives ?? []) as { id: string }[]).map((c) => c.id);

  const lines = ["occurred_at,creative_id,slot,event_type"];
  for (let from = 0; ids.length > 0 && from < MAX_ROWS; from += PAGE) {
    const { data, error } = await ctx.supabase
      .from("ad_events")
      .select("id, occurred_at, creative_id, event_type, ad_slots(key)")
      .in("creative_id", ids)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return new Response("The report could not be built.", { status: 500 });
    const rows = (data ?? []) as unknown as { occurred_at: string; creative_id: string; event_type: string; ad_slots: { key: string } | null }[];
    for (const row of rows) lines.push([row.occurred_at, row.creative_id, row.ad_slots?.key ?? "", row.event_type].join(","));
    if (rows.length < PAGE) break;
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${id.data}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
