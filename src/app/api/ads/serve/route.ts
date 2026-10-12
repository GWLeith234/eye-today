import { NextResponse } from "next/server";

import { FREQ_COOKIE, capReached, parseFrequency, serializeFrequency, utcDay, withServed } from "@/lib/ads/frequency";
import { imageFromHtml, sanitizeAdHtml } from "@/lib/ads/sanitize";
import { isAdSlotName, isPageType, SUPPORTER_HIDDEN } from "@/lib/ads/slots";
import { getSession } from "@/lib/auth/session";
import { mediaUrl } from "@/lib/media/url";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const empty = () => NextResponse.json({}, { headers });

type Served = { creative_id: string; alt: string | null; image_path: string | null; html: string | null; freq_cap: number | null; is_house: boolean };

// The creative for one slot, or {}. Uses the cookie-less anon client and serve_ad(); the only
// thing read from the visitor is the session, and only to hide the big boxes from supporters.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slot = params.get("slot");
  if (!isAdSlotName(slot)) return empty();
  const page = params.get("page");
  const pageType = isPageType(page) ? page : "other";

  if (SUPPORTER_HIDDEN.includes(slot)) {
    const { profile } = await getSession();
    if (profile?.role === "supporter") return empty();
  }

  const supabase = createAnonClient();
  if (!supabase) return empty();
  const { data, error } = await supabase.rpc("serve_ad", { slot_key: slot, page_type: pageType });
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
  // House ads are never capped: they are the fallback, and an empty slot helps nobody.
  if (!row.is_house && capReached(freq, row.creative_id, row.freq_cap)) return empty();

  // Rebuilt on the way out, so nothing stored can reach a page unsanitized. The reader's click goes through
  // /api/ads/click, which reads the stored click_url; nothing from here decides the destination.
  const html = row.html ? sanitizeAdHtml(row.html) : null;
  // Display units only: an uploaded image, or an HTML creative that is a single picture. Text-only HTML
  // (the old house ads) is no longer served, so a unit with no artwork stays empty.
  const found = row.image_path ? mediaUrl(row.image_path, { width: 1200 }) : html && html.usable ? imageFromHtml(html.html) : null;
  if (!found) return empty();
  // House artwork is addressed by the canonical domain; until DNS lands (and on previews) it is served from
  // wherever this request came in, so the picture always loads.
  const imageUrl = found.startsWith("https://theeye.today/house-ads/") ? `${new URL(request.url).origin}${new URL(found).pathname}` : found;

  const response = NextResponse.json(
    {
      creative: {
        id: row.creative_id,
        alt: row.alt ?? "",
        imageUrl,
        html: null,
        house: row.is_house,
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
