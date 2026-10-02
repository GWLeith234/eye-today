import { Resend } from "resend";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

const EVENT_TYPES = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
} as const;

// Resend delivery events. The signature is checked on the raw body before anything else;
// a missing secret or a bad signature is a 400 and writes nothing. Only after that is the
// service-role client loaded, the same way the cron routes do it.
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "not_configured" }, { status: 400, headers });

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return Response.json({ error: "bad_signature" }, { status: 400, headers });

  const payload = await request.text();
  let event;
  try {
    // verify() only checks the signature; the key is never used for a request.
    event = new Resend("re_webhook_verify_only").webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
  } catch {
    return Response.json({ error: "bad_signature" }, { status: 400, headers });
  }

  const eventType = EVENT_TYPES[event.type as keyof typeof EVENT_TYPES];
  if (!eventType) return Response.json({ ok: true, ignored: true }, { headers });
  const providerId = (event.data as { email_id?: string }).email_id;
  if (!providerId) return Response.json({ ok: true, ignored: true }, { headers });

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data: delivery, error: lookupError } = await admin
      .from("newsletter_deliveries")
      .select("site_id, issue_id, subscriber_id")
      .eq("provider_id", providerId)
      .maybeSingle<{ site_id: string; issue_id: string; subscriber_id: string }>();
    if (lookupError) return Response.json({ error: "lookup_failed" }, { status: 500, headers });
    // Not one of ours (a confirmation mail, a test send): acknowledge so Resend stops retrying.
    if (!delivery) return Response.json({ ok: true, unknown: true }, { headers });

    // Status first, then the event row: both are safe to repeat if Resend retries.
    if (eventType === "bounced") {
      const { error } = await admin.from("newsletter_subscribers").update({ status: "bounced" }).eq("id", delivery.subscriber_id);
      if (error) return Response.json({ error: "update_failed" }, { status: 500, headers });
    } else if (eventType === "complained") {
      const { error } = await admin
        .from("newsletter_subscribers")
        .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
        .eq("id", delivery.subscriber_id)
        .in("status", ["active", "pending"]);
      if (error) return Response.json({ error: "update_failed" }, { status: 500, headers });
    }

    const { error: insertError } = await admin.from("newsletter_events").insert({
      site_id: delivery.site_id,
      issue_id: delivery.issue_id,
      subscriber_id: delivery.subscriber_id,
      provider_id: providerId,
      event_type: eventType,
    });
    // 23505: this provider id already has this event. A duplicate is still a success.
    if (insertError && insertError.code !== "23505") return Response.json({ error: "insert_failed" }, { status: 500, headers });
  } catch {
    return Response.json({ error: "failed" }, { status: 500, headers });
  }

  return Response.json({ ok: true }, { headers });
}
