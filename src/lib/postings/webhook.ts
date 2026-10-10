import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { POSTING_KIND, parseDuration } from "./prices";

// Posting payments. handleStripeEvent calls this first; when it returns true the event was a posting
// checkout and no membership, role or newsletter logic sees it. No server-only import: the route passes in
// the service-role client and the tests pass fakes. Throws on a database failure so the route undoes its
// stripe_events record and Stripe retries; apply_posting_payment is itself idempotent on the session id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

export type PostingPaymentOutcome = "duplicate" | "no_posting" | "pending" | "extended" | "renewed" | "ignored";

export async function handlePostingEvent(
  db: SupabaseClient,
  event: Stripe.Event,
  onApplied?: (outcome: PostingPaymentOutcome) => void,
): Promise<boolean> {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return false;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.kind !== POSTING_KIND) return false;

  if (session.payment_status !== "paid" || session.mode !== "payment") {
    onApplied?.("ignored");
    return true;
  }
  const postingId = session.metadata.posting_id;
  const profileId = session.metadata.profile_id;
  const days = parseDuration(session.metadata.days);
  if (!UUID.test(postingId ?? "") || !UUID.test(profileId ?? "") || !days) {
    console.error("stripe posting checkout has no usable metadata");
    onApplied?.("ignored");
    return true;
  }

  const { data, error } = await db.rpc("apply_posting_payment", {
    p_session: session.id,
    p_posting: postingId,
    p_profile: profileId,
    p_days: days,
    p_amount: session.amount_total ?? null,
    p_currency: session.currency ?? null,
    p_payment_intent: idOf(session.payment_intent as string | { id: string } | null),
  });
  if (error) throw new Error(`posting payment failed${error.code ? ` (${error.code})` : ""}`);
  const outcome = (data as PostingPaymentOutcome | null) ?? "ignored";
  if (outcome === "no_posting") console.error("stripe posting checkout does not match a posting by that profile");
  onApplied?.(outcome);
  return true;
}
