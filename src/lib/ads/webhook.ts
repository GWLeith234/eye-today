import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { AD_KIND, parseMonths } from "./prices";

// Ad campaign payments. handleStripeEvent calls this before any membership logic; when it returns true
// the event was an ad checkout and nothing else sees it. No server-only import: the route passes in the
// service-role client and the tests pass fakes. Throws on a database failure so the route undoes its
// stripe_events record and Stripe retries; apply_ad_payment is itself idempotent on the session id.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdPaymentOutcome = "pending" | "duplicate" | "already_paid" | "no_campaign" | "ignored";

export async function handleAdEvent(db: SupabaseClient, event: Stripe.Event, onApplied?: (outcome: AdPaymentOutcome) => void): Promise<boolean> {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return false;
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.metadata?.kind !== AD_KIND) return false;

  if (session.payment_status !== "paid" || session.mode !== "payment") {
    onApplied?.("ignored");
    return true;
  }
  const campaignId = session.metadata.campaign_id;
  const profileId = session.metadata.profile_id;
  const months = parseMonths(session.metadata.months);
  if (!UUID.test(campaignId ?? "") || !UUID.test(profileId ?? "") || !months) {
    console.error("stripe ad checkout has no usable metadata");
    onApplied?.("ignored");
    return true;
  }

  const { data, error } = await db.rpc("apply_ad_payment", {
    p_session: session.id,
    p_campaign: campaignId,
    p_profile: profileId,
    p_months: months,
    p_amount: session.amount_total ?? null,
    p_currency: session.currency ?? null,
  });
  if (error) throw new Error(`ad payment failed${error.code ? ` (${error.code})` : ""}`);
  const outcome = (data as AdPaymentOutcome | null) ?? "ignored";
  if (outcome === "no_campaign") console.error("stripe ad checkout does not match a campaign by that profile");
  onApplied?.(outcome);
  return true;
}
