import { z } from "zod";

import { type BreakdownRow, breakdownCsv } from "@/lib/ads/report";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// The advertiser's own breakdown as CSV. ad_campaign_breakdown runs under RLS, so a campaign that is
// not theirs has no rows; the ownership check here turns that into a 404 rather than an empty file.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getSession();
  if (!user || !supabase) return new Response("Sign in to download reports.", { status: 401 });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });

  const { data: campaign } = await supabase.from("ad_campaigns").select("id").eq("id", id.data).eq("owner_id", user.id).maybeSingle<{ id: string }>();
  if (!campaign) return new Response("Not found", { status: 404 });
  const { data, error } = await supabase.rpc("ad_campaign_breakdown", { campaign: id.data });
  if (error) return new Response("The report could not be built.", { status: 500 });

  return new Response(breakdownCsv((data ?? []) as BreakdownRow[]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${id.data}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
