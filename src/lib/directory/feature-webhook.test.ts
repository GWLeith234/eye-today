import assert from "node:assert/strict";
import { test } from "node:test";

import { handleStripeEvent } from "@/lib/membership/webhook";

import { featureStatus } from "./feature-webhook";

const LISTING = "c1300000-0000-4000-8000-0000000000a1";
const PROFILE = "c1300000-0000-4000-8000-0000000000b1";
const SITE = "00000000-0000-4000-8000-000000000001";
const PERIOD_END = Math.floor(new Date("2027-01-15T00:00:00Z").getTime() / 1000);

type Row = Record<string, unknown>;

// A recording stand-in for the service-role client: it answers the few lookups the feature path makes
// and notes every table it is asked about, so a test can prove memberships were never touched.
function fakeDb(tables: { listing_owners?: Row[]; listing_features?: Row[] } = {}) {
  const touched: string[] = [];
  const upserts: { table: string; row: Row; options: unknown }[] = [];
  const updates: { table: string; row: Row; where: Row }[] = [];
  const db = {
    from(table: string) {
      touched.push(table);
      const where: Row = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          where[column] = value;
          return builder;
        },
        maybeSingle: async () => ({
          data: ((tables as Record<string, Row[]>)[table] ?? []).find((row) => Object.entries(where).every(([k, v]) => row[k] === v)) ?? null,
          error: null,
        }),
        upsert: async (row: Row, options: unknown) => {
          upserts.push({ table, row, options });
          return { error: null };
        },
        update: (row: Row) => ({
          eq: async (column: string, value: unknown) => {
            updates.push({ table, row, where: { [column]: value } });
            return { error: null };
          },
        }),
      };
      return builder;
    },
  };
  return { db, touched, upserts, updates };
}

function fakeStripe(sub: Row) {
  return { subscriptions: { retrieve: async () => sub } };
}

const subscription = (extra: Row = {}) => ({
  id: "sub_feat_1",
  customer: "cus_feat1",
  status: "active",
  metadata: { kind: "directory_feature", listing_id: LISTING, profile_id: PROFILE },
  items: { data: [{ current_period_end: PERIOD_END }] },
  ...extra,
});

const completed = (metadata: Row = { kind: "directory_feature", listing_id: LISTING, profile_id: PROFILE }) => ({
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", mode: "subscription", payment_status: "paid", subscription: "sub_feat_1", customer: "cus_feat1", metadata } },
});

const run = (db: unknown, stripe: unknown, event: unknown) => handleStripeEvent(db as never, stripe as never, event as never, {});

test("a paid featured checkout writes listing_features and never touches memberships, roles or newsletters", async () => {
  const { db, touched, upserts } = fakeDb({ listing_owners: [{ listing_id: LISTING, profile_id: PROFILE, site_id: SITE }] });
  await run(db, fakeStripe(subscription()), completed());

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].table, "listing_features");
  assert.deepEqual(upserts[0].options, { onConflict: "stripe_subscription_id" });
  assert.deepEqual(upserts[0].row, {
    site_id: SITE,
    listing_id: LISTING,
    stripe_subscription_id: "sub_feat_1",
    stripe_customer_id: "cus_feat1",
    status: "active",
    current_period_end: new Date(PERIOD_END * 1000).toISOString(),
  });
  for (const forbidden of ["memberships", "profiles", "newsletter_subscribers", "newsletter_lists", "membership_tiers"]) {
    assert.ok(!touched.includes(forbidden), `${forbidden} must not be read or written`);
  }
});

test("a checkout from someone who does not own the listing creates no feature", async () => {
  const { db, upserts, touched } = fakeDb({ listing_owners: [] });
  await run(db, fakeStripe(subscription()), completed());
  assert.equal(upserts.length, 0);
  assert.ok(!touched.includes("memberships"));
});

test("an unpaid session or a malformed one is acknowledged without a feature", async () => {
  const { db, upserts } = fakeDb({ listing_owners: [{ listing_id: LISTING, profile_id: PROFILE, site_id: SITE }] });
  const unpaid = completed();
  (unpaid.data.object as Row).payment_status = "unpaid";
  await run(db, fakeStripe(subscription()), unpaid);
  await run(db, fakeStripe(subscription()), completed({ kind: "directory_feature", listing_id: "nope", profile_id: PROFILE }));
  assert.equal(upserts.length, 0);
});

test("a cancel-at-period-end subscription stays active; deletion cancels", async () => {
  const features = [{ id: "f1", stripe_subscription_id: "sub_feat_1" }];

  const a = fakeDb({ listing_features: features });
  await run(a.db, fakeStripe({}), { id: "e2", type: "customer.subscription.updated", data: { object: subscription({ cancel_at_period_end: true }) } });
  assert.equal(a.updates.length, 1);
  assert.equal(a.updates[0].row.status, "active", "still featured until current_period_end");
  assert.equal(a.updates[0].row.current_period_end, new Date(PERIOD_END * 1000).toISOString());

  const b = fakeDb({ listing_features: features });
  await run(b.db, fakeStripe({}), { id: "e3", type: "customer.subscription.deleted", data: { object: subscription({ status: "canceled" }) } });
  assert.equal(b.updates[0].row.status, "canceled");
  assert.ok(!b.touched.includes("memberships"));
});

test("an invoice for a feature subscription refreshes that row only", async () => {
  const { db, updates, touched } = fakeDb({ listing_features: [{ id: "f1", stripe_subscription_id: "sub_feat_1" }] });
  await run(db, fakeStripe(subscription()), {
    id: "e4",
    type: "invoice.paid",
    data: { object: { parent: { subscription_details: { subscription: "sub_feat_1" } } } },
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].table, "listing_features");
  assert.ok(!touched.includes("memberships"));
});

test("a membership subscription event is not taken by the feature path", async () => {
  const { db, updates, upserts } = fakeDb({ listing_features: [] });
  // Unknown to listing_features and not tagged: the membership logic runs (and finds no profile here).
  await run(db, fakeStripe({}), {
    id: "e5",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_member", customer: "cus_m", status: "active", metadata: {}, items: { data: [] } } },
  }).catch(() => undefined);
  assert.equal(updates.length, 0);
  assert.equal(upserts.length, 0);
});

test("featureStatus maps Stripe states", () => {
  assert.equal(featureStatus({ status: "active" }), "active");
  assert.equal(featureStatus({ status: "trialing" }), "active");
  assert.equal(featureStatus({ status: "past_due" }), "active");
  assert.equal(featureStatus({ status: "canceled" }), "canceled");
  assert.equal(featureStatus({ status: "unpaid" }), "canceled");
  assert.equal(featureStatus({ status: "active" }, true), "canceled");
});
