import { NextResponse } from "next/server";

import { FREQ_COOKIE, capReached, parseFrequency, serializeFrequency, utcDay, withServed } from "@/lib/ads/frequency";
import { pointLinksAt, sanitizeAdHtml } from "@/lib/ads/sanitize";
import { isAdSlotName, SUPPORTER_HIDDEN } from "@/lib/ads/slots";
import { getSession } from "@/lib/auth/session";
import { mediaUrl } from "@/lib/media/url";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const empty = () => NextResponse.json({}, { headers });

type Served = { creative_id: string; alt: string | null; image_path: string | null; html: string | null; freq_cap: number | null };

// The creative for one slot, or {}. Uses the cookie-less anon client and serve_ad(); the only
// thing read from the visitor is the session, and only to hide the big boxes from supporters.
export async function GET(request: Request) {
  const slot = new URL(request.url).searchParams.get("slot");
  if (!isAdSlotName(slot)) return empty();

  if (SUPPORTER_HIDDEN.includes(slot)) {
    const { profile } = await getSession();
    if (profile?.role === "supporter") return empty();
  }

  const supabase = createAnonClient();
  if (!supabase) return empty();
  const { data, error } = await supabase.rpc("serve_ad", { slot_key: slot });
  if (error) {
    console.error("serve_ad failed", error.code);
    return empty();
  }
  const row = ((data as Served[] | null) ?? [])[0];
  if (!row) return empty();

  const today = utcDay(new Date());
  const cookies = request.headers.get("cookie") ?? "";
  const raw = new RegExp(`(?:^|;\\s*)${FREQ_COOKIE}=([^;]*)`).exec(cookies)?.[1];
  const freq = parseFrequency(raw ? decodeURIComponent(raw) : null, today);
  if (capReached(freq, row.creative_id, row.freq_cap)) return empty();

  // Rebuilt on the way out, so nothing stored can reach a page unsanitized. Links in HTML all go
  // through the click route; the destination comes from the stored click_url, never from here.
  const clickPath = `/api/ads/click/${row.creative_id}`;
  const html = row.html ? sanitizeAdHtml(row.html) : null;
  const imageUrl = row.image_path ? mediaUrl(row.image_path, { width: 1200 }) : null;
  if (!imageUrl && !(html && html.usable)) return empty();

  const response = NextResponse.json(
    {
      creative: {
        id: row.creative_id,
        alt: row.alt ?? "",
        imageUrl,
        html: imageUrl || !html ? null : pointLinksAt(html.html, clickPath),
      },
    },
    { headers },
  );
  response.cookies.set(FREQ_COOKIE, serializeFrequency(withServed(freq, row.creative_id)), {
    path: "/",
    maxAge: 86_400,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
