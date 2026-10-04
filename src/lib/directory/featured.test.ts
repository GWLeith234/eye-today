import assert from "node:assert/strict";
import { test } from "node:test";

import { featuredOffered, featuredPrices, runFeaturedCheckout, type FeaturedDeps } from "./featured";

const ENV = {
  STRIPE_SECRET_KEY: "k",
  SITE_URL: "https://eye.example/",
  STRIPE_PRICE_FEATURED_MONTHLY: "price_fm",
  STRIPE_PRICE_FEATURED_ANNUAL: "price_fa",
};

test("featured is offered only with the key, SITE_URL and both featured prices", () => {
  assert.equal(featuredOffered(ENV), true);
  for (const missing of Object.keys(ENV)) {
    assert.equal(featuredOffered({ ...ENV, [missing]: undefined }), false, `${missing} missing`);
    assert.equal(featuredOffered({ ...ENV, [missing]: "  " }), false, `${missing} blank`);
  }
  assert.deepEqual(featuredPrices({}), { monthly: null, annual: null });
});

test("featured does not need the supporter prices", () => {
  assert.equal(featuredOffered({ ...ENV, STRIPE_PRICE_MONTHLY: undefined, STRIPE_PRICE_ANNUAL: undefined, STRIPE_PRICE_ONCE: undefined }), true);
});

function deps(overrides: Partial<FeaturedDeps> = {}): { deps: FeaturedDeps; sessions: Record<string, unknown>[]; customers: unknown[] } {
  const sessions: Record<string, unknown>[] = [];
  const customers: unknown[] = [];
  let stored: string | null = null;
  return {
    sessions,
    customers,
    deps: {
      env: ENV,
      userId: "u1",
      email: "o@e.test",
      listingId: "l1",
      isOwner: async () => true,
      hasActiveFeature: async () => false,
      getStoredCustomer: async () => stored,
      createCustomer: async (params) => {
        customers.push(params);
        return "cus_new";
      },
      attachCustomer: async (id) => {
        stored = id;
      },
      createSession: async (params) => {
        sessions.push(params as unknown as Record<string, unknown>);
        return "https://checkout.example/s";
      },
      ...overrides,
    },
  };
}

test("an owner gets a subscription session for the chosen price, tagged as a directory feature", async () => {
  const { deps: d, sessions, customers } = deps();
  const outcome = await runFeaturedCheckout(d, "annual");
  assert.deepEqual(outcome, { ok: true, url: "https://checkout.example/s" });
  assert.equal(customers.length, 1);
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0], {
    mode: "subscription",
    customer: "cus_new",
    client_reference_id: "u1",
    line_items: [{ price: "price_fa", quantity: 1 }],
    metadata: { kind: "directory_feature", listing_id: "l1", profile_id: "u1" },
    subscription_data: { metadata: { kind: "directory_feature", listing_id: "l1", profile_id: "u1" } },
    success_url: "https://eye.example/account/listings?featured=1",
    cancel_url: "https://eye.example/account/listings",
  });
  assert.equal(((await runFeaturedCheckout(deps().deps, "monthly")) as { ok: true }).ok, true);
});

test("a non-owner, an already featured listing, or a bad interval never reaches Stripe", async () => {
  for (const [override, interval, error] of [
    [{ isOwner: async () => false }, "monthly", "not_owner"],
    [{ hasActiveFeature: async () => true }, "monthly", "already_featured"],
    [{}, "weekly", "invalid_interval"],
    [{ env: { ...ENV, STRIPE_PRICE_FEATURED_ANNUAL: undefined } }, "monthly", "not_configured"],
  ] as const) {
    const { deps: d, sessions, customers } = deps(override as Partial<FeaturedDeps>);
    assert.deepEqual(await runFeaturedCheckout(d, interval), { ok: false, error });
    assert.equal(sessions.length, 0);
    assert.equal(customers.length, 0);
  }
});

test("a Stripe failure is reported as failed", async () => {
  const { deps: d } = deps({ createSession: async () => { throw new Error("boom"); } });
  assert.deepEqual(await runFeaturedCheckout(d, "monthly"), { ok: false, error: "failed" });
});
