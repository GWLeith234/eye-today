import { createHash } from "node:crypto";

import { z } from "zod";

import { forwardedIp, rateLimit } from "@/lib/http/rate-limit";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ id: z.uuid() });

// Always 204 with no body: the response never says whether a view counted,
// whether the id exists, or whether the article is live.
function done() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

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

  // Only a salted hash of the first forwarded address is stored, never the IP.
  const ip = forwardedIp(request.headers.get("x-forwarded-for"));
  if (!rateLimit(`view:${ip}`, 30, 60_000)) return done();
  const salt = process.env.VIEW_HASH_SALT || "eye-today-view";
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex");

  const { error } = await supabase.rpc("record_article_view", { article: parsed.data.id, ip_hash: ipHash });
  if (error) console.error("record_article_view failed", error.code);
  return done();
}
