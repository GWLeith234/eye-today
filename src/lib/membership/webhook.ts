import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { newConfirmToken, unsubscribeToken } from "@/lib/newsletter/tokens";

import { membershipStatusFrom, pastDuePeriodEnd } from "./mapping";
import { type Env, tierForPrice } from "./prices";
import { type MembershipLike, nextRole, type Role } from "./roles";

// Applies one verified Stripe event. It never imports the service-role client: the route passes it in
// after constructEvent has succeeded. Throws on any failure so the route can undo its idempotency
// record and let Stripe retry. Logs ids and types only.

type Profile = { id: string; site_id: string; email: string | null; role: Role };
type MembershipRow = {
  id: string;
  profile_id: string;
  status: MembershipLike["status"];
  current_period_end: string | null;
  stripe_subscription_id: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));
const fromUnix = (seconds: number | null | undefined) => (typeof seconds === "number" ? new Date(seconds * 1000) : null);

function fail(step: string, error: { code?: string } | null): never {
  throw new Error(`${step} failed${error?.code ? ` (${error.code})` : ""}`);
}

async function loadProfile(db: SupabaseClient, by: { id: string } | { customer: string }): Promise<Profile | null> {
  const query = db.from("profiles").select("id, site_id, email, role");
  const { data, error } = await ("id" in by ? query.eq("id", by.id) : query.eq("stripe_customer_id", by.customer)).maybeSingle<Profile>();
  if (error) fail("profile lookup", error);
  return data;
}

async function tierId(db: SupabaseClient, env: Env, profile: Profile, priceId: string | null): Promise<string | null> {
  let slug: string | null = tierForPrice(env, priceId);
  if (!slug && priceId) {
    const { data } = await db
      .from("membership_tiers")
      .select("slug")
      .eq("site_id", profile.site_id)
      .eq("stripe_price_id", priceId)
      .maybeSingle<{ slug: string }>();
    slug = data?.slug ?? null;
  }
  if (!slug) return null;
  const { data, error } = await db
    .from("membership_tiers")
    .select("id")
    .eq("site_id", profile.site_id)
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();
  if (error) fail("tier lookup", error);
  return data?.id ?? null;
}

type Change = {
  tier: string;
  status: MembershipLike["status"];
  periodEnd: Date | null;
  canceledAt: Date | null;
  subscriptionId: string | null;
  sessionId: string | null;
  amountCents: number | null;
};

// One row per profile and site (0001). A subscription updates its own row; a new checkout may take
// over the profile's row only when that row no longer grants supporter, so a second purchase cannot
// overwrite a live subscription that is still billing.
async function saveMembership(db: SupabaseClient, profile: Profile, change: Change, now: Date): Promise<boolean> {
  const columns = "id, profile_id, status, current_period_end, stripe_subscription_id";
  const find = async (column: string, value: string) => {
    const { data, error } = await db.from("memberships").select(columns).eq(column, value).maybeSingle<MembershipRow>();
    if (error) fail("membership lookup", error);
    return data;
  };

  let existing =
    (change.subscriptionId ? await find("stripe_subscription_id", change.subscriptionId) : null) ??
    (change.sessionId ? await find("stripe_checkout_session_id", change.sessionId) : null);
  if (!existing) {
    const { data, error } = await db
      .from("memberships")
      .select(columns)
      .eq("site_id", profile.site_id)
      .eq("profile_id", profile.id)
      .maybeSingle<MembershipRow>();
    if (error) fail("membership lookup", error);
    const live = data && nextRole("reader", [data], now) === "supporter";
    if (data && live && data.stripe_subscription_id !== change.subscriptionId) {
      console.error("stripe membership skipped: profile already has a live membership");
      return false;
    }
    existing = data;
  }

  let periodEnd = change.periodEnd;
  if (change.status === "past_due") {
    periodEnd = pastDuePeriodEnd(existing?.current_period_end ? new Date(existing.current_period_end) : null, change.periodEnd, null, now);
  }

  const row = {
    site_id: profile.site_id,
    profile_id: profile.id,
    tier_id: change.tier,
    status: change.status,
    current_period_end: periodEnd?.toISOString() ?? null,
    canceled_at: change.canceledAt?.toISOString() ?? null,
    stripe_subscription_id: change.subscriptionId,
    stripe_checkout_session_id: change.sessionId ?? undefined,
    amount_cents: change.amountCents,
  };

  if (existing) {
    const { error } = await db.from("memberships").update(row).eq("id", existing.id);
    if (error) fail("membership update", error);
    return true;
  }
  const { error } = await db.from("memberships").insert(row);
  if (error?.code === "23505") {
    // A concurrent delivery created it first: apply this one on top.
    const raced =
      (change.subscriptionId && (await find("stripe_subscription_id", change.subscriptionId))) ||
      (change.sessionId && (await find("stripe_checkout_session_id", change.sessionId)));
    if (!raced) fail("membership insert", error);
    const { error: updateError } = await db.from("memberships").update(row).eq("id", raced.id);
    if (updateError) fail("membership update", updateError);
    return true;
  }
  if (error) fail("membership insert", error);
  return true;
}

// Ask the database to make profiles.role match the memberships, then check it against nextRole().
async function syncRole(db: SupabaseClient, profileId: string, now: Date) {
  const { error } = await db.rpc("sync_supporter_role", { profile: profileId });
  if (error) fail("role sync", error);

  const [{ data: after }, { data: memberships }] = await Promise.all([
    db.from("profiles").select("role").eq("id", profileId).maybeSingle<{ role: Role }>(),
    db.from("memberships").select("status, current_period_end").eq("profile_id", profileId),
  ]);
  if (after && after.role !== nextRole(after.role, (memberships ?? []) as MembershipLike[], now)) {
    console.error("supporter role rules disagree with sync_supporter_role");
  }
}

// Ticking the box at checkout is the reader's request for the Supporters newsletter, so the row is
// created active. No confirmation mail. A bounced address stays bounced.
async function joinSupportersNewsletter(db: SupabaseClient, profile: Profile, fallbackEmail: string | null, now: Date) {
  const email = (profile.email ?? fallbackEmail ?? "").trim().toLowerCase();
  if (!email.includes("@")) return;
  const { data: list } = await db.from("newsletter_lists").select("id").eq("site_id", profile.site_id).eq("slug", "supporters").maybeSingle<{ id: string }>();
  if (!list) return;

  const confirm = newConfirmToken();
  const secret = process.env.NEWSLETTER_LINK_SECRET?.trim();
  if (!secret) console.error("supporters newsletter joined without NEWSLETTER_LINK_SECRET: unsubscribe links will not work until it is set");
  const fields = {
    status: "active" as const,
    consented_at: now.toISOString(),
    confirmed_at: now.toISOString(),
    unsubscribed_at: null,
    confirm_token_hash: confirm.hash,
    unsubscribe_token_hash: secret ? unsubscribeToken(secret, confirm.hash).hash : null,
    profile_id: profile.id,
  };

  const { data: existing } = await db
    .from("newsletter_subscribers")
    .select("id, status")
    .eq("list_id", list.id)
    .eq("email", email)
    .maybeSingle<{ id: string; status: string }>();
  if (!existing) {
    const { error } = await db.from("newsletter_subscribers").insert({ site_id: profile.site_id, list_id: list.id, email, ...fields });
    if (error && error.code !== "23505") fail("newsletter opt-in", error);
  } else if (existing.status === "pending" || existing.status === "unsubscribed") {
    const { error } = await db.from("newsletter_subscribers").update(fields).eq("id", existing.id);
    if (error) fail("newsletter opt-in", error);
  }
}

const priceOf = (sub: Stripe.Subscription) => sub.items.data[0]?.price ?? null;
const periodEndOf = (sub: Stripe.Subscription) => {
  const ends = sub.items.data.map((item) => item.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? fromUnix(Math.max(...ends)) : null;
};

async function applySubscription(
  db: SupabaseClient,
  env: Env,
  sub: Stripe.Subscription,
  now: Date,
  options: { profile?: Profile | null; sessionId?: string | null; forceStatus?: MembershipLike["status"]; nextAttempt?: Date | null; amountFallback?: number | null } = {},
) {
  const metaProfile = sub.metadata?.profile_id;
  const customer = idOf(sub.customer);
  const profile =
    options.profile ??
    (metaProfile && UUID.test(metaProfile) ? await loadProfile(db, { id: metaProfile }) : null) ??
    (customer ? await loadProfile(db, { customer }) : null);
  if (!profile) {
    console.error("stripe subscription has no matching profile");
    return null;
  }

  const status = options.forceStatus ?? membershipStatusFrom(sub.status);
  if (!status) return null;
  const price = priceOf(sub);
  const tier = await tierId(db, env, profile, price?.id ?? null);
  if (!tier) {
    console.error("stripe subscription has an unknown price: no membership created");
    return null;
  }

  let periodEnd = periodEndOf(sub);
  if (status === "past_due" && options.nextAttempt) periodEnd = pastDuePeriodEnd(null, periodEnd, options.nextAttempt, now);
  const saved = await saveMembership(
    db,
    profile,
    {
      tier,
      status,
      periodEnd,
      canceledAt: status === "canceled" ? (fromUnix(sub.ended_at) ?? fromUnix(sub.canceled_at) ?? now) : fromUnix(sub.canceled_at),
      subscriptionId: sub.id,
      sessionId: options.sessionId ?? null,
      amountCents: price?.unit_amount != null ? price.unit_amount * (sub.items.data[0]?.quantity ?? 1) : (options.amountFallback ?? null),
    },
    now,
  );
  return saved ? profile : null;
}

export async function handleStripeEvent(db: SupabaseClient, stripe: Stripe, event: Stripe.Event, env: Env, now: Date = new Date()) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status !== "paid") return;
      const ref = session.client_reference_id ?? session.metadata?.profile_id ?? null;
      const profile = ref && UUID.test(ref) ? await loadProfile(db, { id: ref }) : null;
      if (!profile) return console.error("stripe checkout has no matching profile");

      let saved: Profile | null = null;
      if (session.mode === "subscription") {
        const subId = idOf(session.subscription);
        if (!subId) return;
        const sub = await stripe.subscriptions.retrieve(subId);
        saved = await applySubscription(db, env, sub, now, { profile, sessionId: session.id, amountFallback: session.amount_total });
      } else if (session.mode === "payment") {
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        const tier = await tierId(db, env, profile, items.data[0]?.price?.id ?? null);
        if (!tier) return console.error("stripe payment has an unknown price: no membership created");
        // A single payment has no renewal: it stays active with no period end.
        const ok = await saveMembership(
          db,
          profile,
          { tier, status: "active", periodEnd: null, canceledAt: null, subscriptionId: null, sessionId: session.id, amountCents: session.amount_total },
          now,
        );
        saved = ok ? profile : null;
      }
      if (!saved) return;
      if (session.metadata?.newsletter === "1") await joinSupportersNewsletter(db, saved, session.customer_details?.email ?? null, now);
      await syncRole(db, saved.id, now);
      return;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const forced = event.type === "customer.subscription.deleted" ? ("canceled" as const) : undefined;
      const profile = await applySubscription(db, env, sub, now, { forceStatus: forced });
      if (profile) await syncRole(db, profile.id, now);
      return;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subId = idOf(invoice.parent?.subscription_details?.subscription);
      if (!subId) return; // not a subscription invoice
      const sub = await stripe.subscriptions.retrieve(subId);
      const failed = event.type === "invoice.payment_failed";
      const profile = await applySubscription(db, env, sub, now, {
        forceStatus: failed ? "past_due" : undefined,
        nextAttempt: failed ? fromUnix(invoice.next_payment_attempt) : null,
      });
      if (profile) await syncRole(db, profile.id, now);
      return;
    }

    default:
      return;
  }
}
