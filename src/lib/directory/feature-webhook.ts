import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { FEATURED_KIND } from "./featured";

// Featured-listing Stripe events. handleStripeEvent calls this first; when it returns true the event
// was a feature event and nothing else (memberships, roles, the Supporters newsletter) runs for it.
// No server-only import: the route passes in the service-role client and the tests pass fakes.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));

function fail(step: string, error: { code?: string } | null): never {
  throw new Error(`${step} failed${error?.code ? ` (${error.code})` : ""}`);
}

// The latest period end across the subscription's items.
function periodEnd(sub: Stripe.Subscription): string | null {
  const ends = sub.items.data.map((item) => item.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null;
}

// Active, trialing and past_due keep the listing featured until current_period_end (the public query
// also checks that timestamp). Anything else, and an explicit deletion, is canceled.
export function featureStatus(sub: Pick<Stripe.Subscription, "status">, deleted = false): "active" | "canceled" {
  if (deleted) return "canceled";
  return sub.status === "active" || sub.status === "trialing" || sub.status === "past_due" ? "active" : "canceled";
}

async function hasFeatureRow(db: SupabaseClient, subscriptionId: string): Promise<boolean> {
  const { data, error } = await db.from("listing_features").select("id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (error) fail("feature lookup", error);
  return Boolean(data);
}

async function refresh(db: SupabaseClient, sub: Stripe.Subscription, deleted: boolean) {
  const { error } = await db
    .from("listing_features")
    .update({ status: featureStatus(sub, deleted), current_period_end: periodEnd(sub) })
    .eq("stripe_subscription_id", sub.id);
  if (error) fail("feature update", error);
}

export async function handleFeatureEvent(db: SupabaseClient, stripe: Stripe, event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.metadata?.kind !== FEATURED_KIND) return false;
      if (session.payment_status !== "paid" || session.mode !== "subscription") return true;
      const subscriptionId = idOf(session.subscription);
      const listingId = session.metadata.listing_id;
      const profileId = session.metadata.profile_id;
      if (!subscriptionId || !UUID.test(listingId ?? "") || !UUID.test(profileId ?? "")) {
        console.error("stripe feature checkout has no usable metadata");
        return true;
      }

      // Defence in depth: the checkout was only offered to an owner, and the webhook checks again.
      const { data: owner, error: ownerError } = await db
        .from("listing_owners")
        .select("site_id")
        .eq("listing_id", listingId)
        .eq("profile_id", profileId)
        .maybeSingle<{ site_id: string }>();
      if (ownerError) fail("owner lookup", ownerError);
      if (!owner) {
        console.error("stripe feature checkout is not from an owner: no feature created");
        return true;
      }

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const { error } = await db.from("listing_features").upsert(
        {
          site_id: owner.site_id,
          listing_id: listingId,
          stripe_subscription_id: sub.id,
          stripe_customer_id: idOf(sub.customer) ?? idOf(session.customer),
          status: featureStatus(sub),
          current_period_end: periodEnd(sub),
        },
        { onConflict: "stripe_subscription_id" },
      );
      if (error) fail("feature upsert", error);
      return true;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      if (sub.metadata?.kind !== FEATURED_KIND && !(await hasFeatureRow(db, sub.id))) return false;
      await refresh(db, sub, event.type === "customer.subscription.deleted");
      return true;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = idOf(event.data.object.parent?.subscription_details?.subscription);
      if (!subscriptionId || !(await hasFeatureRow(db, subscriptionId))) return false;
      await refresh(db, await stripe.subscriptions.retrieve(subscriptionId), false);
      return true;
    }

    default:
      return false;
  }
}
