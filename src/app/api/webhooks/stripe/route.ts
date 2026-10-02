import Stripe from "stripe";

import { getStripe } from "@/lib/membership/stripe";
import { handleStripeEvent } from "@/lib/membership/webhook";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

const HANDLED = /^(checkout\.|customer\.subscription\.|invoice\.)/;

// Stripe events. The signature is checked on the raw body first; a missing secret or a bad
// signature is a 400 and writes nothing. Only then is the service-role client loaded. The event
// id is recorded before the event is applied, so a replay finds the id and changes nothing.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "not_configured" }, { status: 400, headers });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "bad_signature" }, { status: 400, headers });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return Response.json({ error: "bad_signature" }, { status: 400, headers });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  let db;
  try {
    db = createAdminClient();
  } catch {
    return Response.json({ error: "not_configured" }, { status: 500, headers });
  }

  const { error: recordError } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (recordError) {
    // 23505: already processed. Acknowledge so Stripe stops retrying, and apply nothing.
    if (recordError.code === "23505") return Response.json({ ok: true, duplicate: true }, { headers });
    return Response.json({ error: "record_failed" }, { status: 500, headers });
  }

  try {
    const stripe = getStripe();
    if (stripe) await handleStripeEvent(db, stripe, event, process.env);
    else if (HANDLED.test(event.type)) throw new Error("STRIPE_SECRET_KEY is not set");
    console.log(`stripe event ${event.id} ${event.type}`);
  } catch (error) {
    // Undo the record so Stripe's retry is applied rather than skipped as a duplicate.
    console.error(`stripe event ${event.id} ${event.type} failed: ${error instanceof Error ? error.message : "unknown"}`);
    await db.from("stripe_events").delete().eq("id", event.id);
    return Response.json({ error: "failed" }, { status: 500, headers });
  }
  return Response.json({ ok: true }, { headers });
}
