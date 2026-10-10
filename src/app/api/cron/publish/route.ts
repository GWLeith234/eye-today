import { createHash, timingSafeEqual } from "node:crypto";

import { refreshPostings } from "@/lib/postings/revalidate";
import { revalidateAllPublic } from "@/lib/public/revalidate";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

// Hash both sides so the comparison is constant-time regardless of length.
function matchesSecret(authorization: string | null, secret: string) {
  const given = createHash("sha256").update(authorization ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !matchesSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }

  // The service role is loaded only after the secret matches.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const { data, error } = await db.rpc("publish_due_articles");
  if (error) {
    return Response.json({ error: "publish_failed" }, { status: 500, headers });
  }
  if (data) revalidateAllPublic();

  // Same five-minute run: postings past their expiry or closing date. Public reads already hide them;
  // this flips the status and refreshes the boards. A failure here does not undo the publish above.
  const expired = await db.rpc("expire_postings");
  if (expired.error) console.error("expire postings failed", expired.error.code);
  else if (expired.data) refreshPostings();

  return Response.json({ published: data ?? 0, expired: expired.error ? null : (expired.data ?? 0) }, { headers });
}
