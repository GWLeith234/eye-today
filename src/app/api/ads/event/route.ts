import { z } from "zod";

import { adIpHash } from "@/lib/ads/ip-hash";
import { AD_SLOT_NAMES } from "@/lib/ads/slots";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

// Impressions only; clicks are recorded by the click route. Always 204 with no body, so the
// response never says whether an event counted.
const bodySchema = z.object({ creative: z.uuid(), slot: z.enum(AD_SLOT_NAMES) });

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return done();
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return done();

  const supabase = createAnonClient();
  if (!supabase) return done();
  const { error } = await supabase.rpc("record_ad_event", {
    creative: parsed.data.creative,
    slot_key: parsed.data.slot,
    event_type: "impression",
    ip_hash: adIpHash(request),
  });
  if (error) console.error("record_ad_event failed", error.code);
  return done();
}
