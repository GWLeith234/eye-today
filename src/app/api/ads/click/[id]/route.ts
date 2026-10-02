import { NextResponse } from "next/server";
import { z } from "zod";

import { adIpHash } from "@/lib/ads/ip-hash";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const notFound = () => new Response("Not found", { status: 404, headers: noStore });

// Records the click, then redirects to the click_url stored on the creative. The destination is
// never read from the request: a URL in the query string is ignored. Only https destinations
// redirect; anything else, and any creative that is no longer served, is a 404.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creative = z.uuid().safeParse(id);
  if (!creative.success) return notFound();

  const supabase = createAnonClient();
  if (!supabase) return notFound();

  const { data, error } = await supabase.rpc("ad_click_target", { creative: creative.data });
  if (error) return notFound();
  const target = ((data as { click_url: string; slot_key: string }[] | null) ?? [])[0];
  if (!target) return notFound();

  let destination: URL;
  try {
    destination = new URL(target.click_url);
  } catch {
    return notFound();
  }
  if (destination.protocol !== "https:") return notFound();

  await supabase.rpc("record_ad_event", {
    creative: creative.data,
    slot_key: target.slot_key,
    event_type: "click",
    ip_hash: adIpHash(request),
  });

  return NextResponse.redirect(destination, { status: 302, headers: noStore });
}
