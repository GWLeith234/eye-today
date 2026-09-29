import { createHash, timingSafeEqual } from "node:crypto";

import { sendIssue } from "@/lib/newsletter/send";

export const dynamic = "force-dynamic";
// Big lists send one recipient at a time.
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store" };

// Hash both sides so the comparison is constant-time regardless of length.
function matchesSecret(authorization: string | null, secret: string) {
  const given = createHash("sha256").update(authorization ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

// Sends scheduled issues whose time has passed. Call it every few minutes:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" $SITE_URL/api/cron/newsletters
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !matchesSecret(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }

  // The service role is loaded only after the secret matches.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data: due, error } = await admin
    .from("newsletter_issues")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(5);
  if (error) return Response.json({ error: "lookup_failed" }, { status: 500, headers });

  const results: { id: string; ok: boolean; sent?: number; skipped?: number; failed?: number; error?: string }[] = [];
  for (const issue of (due ?? []) as { id: string }[]) {
    const report = await sendIssue(admin, issue.id);
    results.push(report.ok ? { id: issue.id, ...report } : { id: issue.id, ok: false, error: report.error });
  }
  return Response.json({ issues: results }, { headers });
}
