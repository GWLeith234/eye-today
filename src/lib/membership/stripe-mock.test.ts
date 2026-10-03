import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runCheckout } from "./checkout";
import { createMockStripe, mockStripeDir, readStripeCalls } from "./stripe-mock";

const ENV = {
  STRIPE_SECRET_KEY: "k",
  STRIPE_PRICE_MONTHLY: "price_m",
  STRIPE_PRICE_ANNUAL: "price_a",
  STRIPE_PRICE_ONCE: "price_o",
  SITE_URL: "http://127.0.0.1:3000",
};

test("the Stripe double is off unless STRIPE_PROVIDER=mock and a directory are both set", () => {
  assert.equal(mockStripeDir({}), null);
  assert.equal(mockStripeDir({ STRIPE_PROVIDER: "mock" }), null);
  assert.equal(mockStripeDir({ E2E_RECORD_DIR: "/tmp/x" }), null);
  assert.equal(mockStripeDir({ STRIPE_PROVIDER: "live", E2E_RECORD_DIR: "/tmp/x" }), null);
  assert.equal(mockStripeDir({ STRIPE_PROVIDER: "mock", E2E_RECORD_DIR: "/tmp/x" }), "/tmp/x");
});

test("runCheckout against the double records the customer and a session for the requested price", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mock-stripe-"));
  try {
    const stripe = createMockStripe(dir);
    let stored: string | null = null;
    const outcome = await runCheckout(
      {
        env: ENV,
        userId: "u1",
        email: "u@e.test",
        createCustomer: async (params) => (await stripe.customers.create(params)).id,
        createSession: async (params) => (await stripe.checkout.sessions.create(params)).url,
        getStoredCustomer: async () => stored,
        attachCustomer: async (id) => {
          stored = id;
        },
        hasActiveMembership: async () => false,
      },
      { priceId: "price_m", newsletter: true },
    );
    assert.equal(outcome.ok, true);

    const calls = readStripeCalls(dir);
    assert.deepEqual(calls.map((c) => c.op), ["customers.create", "checkout.sessions.create"]);
    const [customer, session] = calls;
    assert.equal(stored, customer.result.id);
    assert.equal(session.params.customer, customer.result.id);
    assert.equal(session.params.mode, "subscription");
    assert.deepEqual(session.params.line_items, [{ price: "price_m", quantity: 1 }]);
    assert.equal(outcome.ok && outcome.url, session.result.url);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the double answers the follow-up calls the webhook makes from what it recorded", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mock-stripe-"));
  try {
    const stripe = createMockStripe(dir);
    await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: "cus_x",
      line_items: [{ price: "price_m", quantity: 1 }],
      subscription_data: { metadata: { profile_id: "u1" } },
    });
    await stripe.checkout.sessions.create({ mode: "payment", customer: "cus_x", line_items: [{ price: "price_o", quantity: 1 }] });
    const [monthly, once] = readStripeCalls(dir);

    const sub = await stripe.subscriptions.retrieve(monthly.result.subscription!);
    assert.equal(sub.id, monthly.result.subscription);
    assert.equal(sub.metadata.profile_id, "u1");
    assert.equal(sub.items.data[0].price.id, "price_m");
    assert.ok(sub.items.data[0].current_period_end > Date.now() / 1000);
    await assert.rejects(stripe.subscriptions.retrieve("sub_unknown"));

    assert.deepEqual((await stripe.checkout.sessions.listLineItems(once.result.id)).data, [{ price: { id: "price_o" } }]);
    assert.deepEqual((await stripe.checkout.sessions.listLineItems("cs_unknown")).data, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
