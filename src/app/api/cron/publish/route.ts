import { createHash, timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";

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
  const { data, error } = await createAdminClient().rpc("publish_due_articles");
  if (error) {
    return Response.json({ error: "publish_failed" }, { status: 500, headers });
  }

  revalidatePath("/articles", "layout");
  return Response.json({ published: data ?? 0 }, { headers });
}
