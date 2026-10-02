import assert from "node:assert/strict";
import { test } from "node:test";

import { runCheckout, type CheckoutDeps } from "./checkout";
import { membershipStatusFrom, pastDuePeriodEnd } from "./mapping";
import { checkoutConfigured, modeFor, paymentsOpen, tierForPrice } from "./prices";
import { nextRole } from "./roles";

const NOW = new Date("2026-09-29T12:00:00Z");
const past = "2026-09-20T00:00:00Z";
const future = "2026-10-20T00:00:00Z";

test("reader plus an active membership becomes supporter", () => {
  assert.equal(nextRole("reader", [{ status: "active", current_period_end: future }], NOW), "supporter");
  assert.equal(nextRole("reader", [{ status: "active", current_period_end: null }], NOW), "supporter");
});

test("supporter plus a canceled membership whose period is past becomes reader", () => {
  assert.equal(nextRole("supporter", [{ status: "canceled", current_period_end: past }], NOW), "reader");
  assert.equal(nextRole("supporter", [], NOW), "reader");
});

test("an active membership that is cancelling at period end keeps the supporter role", () => {
  // Stripe leaves status active with cancel_at_period_end, so the rule sees an ordinary active membership.
  assert.equal(nextRole("supporter", [{ status: "active", current_period_end: future }], NOW), "supporter");
});

test("past_due keeps supporter inside its period and drops it after", () => {
  assert.equal(nextRole("reader", [{ status: "past_due", current_period_end: future }], NOW), "supporter");
  assert.equal(nextRole("reader", [{ status: "past_due", current_period_end: null }], NOW), "supporter");
  assert.equal(nextRole("supporter", [{ status: "past_due", current_period_end: past }], NOW), "reader");
  assert.equal(nextRole("reader", [{ status: "expired", current_period_end: future }], NOW), "reader");
});

test("editor, admin and contributor never change", () => {
  const active = [{ status: "active" as const, current_period_end: future }];
  const canceled = [{ status: "canceled" as const, current_period_end: past }];
  for (const role of ["editor", "admin", "contributor"] as const) {
    assert.equal(nextRole(role, active, NOW), role);
    assert.equal(nextRole(role, canceled, NOW), role);
  }
});

test("stripe statuses map to membership statuses", () => {
  assert.equal(membershipStatusFrom("active"), "active");
  assert.equal(membershipStatusFrom("trialing"), "active");
  assert.equal(membershipStatusFrom("past_due"), "past_due");
  assert.equal(membershipStatusFrom("canceled"), "canceled");
  assert.equal(membershipStatusFrom("unpaid"), "expired");
  assert.equal(membershipStatusFrom("incomplete"), null);
});

test("a failing payment extends past_due to the next retry and is never pulled back", () => {
  const oldEnd = new Date("2026-09-25T00:00:00Z");
  const retry = new Date("2026-10-02T00:00:00Z");
  assert.equal(pastDuePeriodEnd(null, oldEnd, retry, NOW).toISOString(), retry.toISOString());
  // A later subscription.updated still reports the old period end: the extension stays.
  assert.equal(pastDuePeriodEnd(retry, oldEnd, null, NOW).toISOString(), retry.toISOString());
  // No retry date: a short grace from now.
  assert.ok(pastDuePeriodEnd(null, oldEnd, null, NOW).getTime() > NOW.getTime());
});

const ENV = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_PRICE_MONTHLY: "price_m",
  STRIPE_PRICE_ANNUAL: "price_a",
  STRIPE_PRICE_ONCE: "price_o",
  SITE_URL: "https://eye.example/",
};

test("price ids map to tiers only when they are one of the three env vars", () => {
  assert.equal(tierForPrice(ENV, "price_m"), "monthly");
  assert.equal(tierForPrice(ENV, "price_o"), "once");
  assert.equal(tierForPrice(ENV, "price_other"), null);
  assert.equal(tierForPrice(ENV, ""), null);
  assert.equal(modeFor("once"), "payment");
  assert.equal(modeFor("annual"), "subscription");
});

test("payments are open only with the key and all three prices", () => {
  assert.equal(paymentsOpen(ENV), true);
  assert.equal(paymentsOpen({ ...ENV, STRIPE_PRICE_ONCE: "" }), false);
  assert.equal(paymentsOpen({ ...ENV, STRIPE_SECRET_KEY: undefined }), false);
  assert.equal(paymentsOpen({}), false);
  assert.equal(checkoutConfigured({ ...ENV, SITE_URL: "" }), false);
});

function deps(overrides: Partial<CheckoutDeps> = {}) {
  const calls = { customers: 0, sessions: [] as unknown[], attached: [] as string[] };
  const d: CheckoutDeps = {
    env: ENV,
    userId: "11111111-1111-4111-8111-111111111111",
    email: "reader@example.com",
    createCustomer: async () => {
      calls.customers++;
      return "cus_new123456";
    },
    createSession: async (params) => {
      calls.sessions.push(params);
      return "https://checkout.stripe.test/session";
    },
    getStoredCustomer: async () => (calls.attached.length ? calls.attached[0] : null),
    attachCustomer: async (id) => void calls.attached.push(id),
    hasActiveMembership: async () => false,
    ...overrides,
  };
  return { d, calls };
}

test("a checkout with a price id outside the three env vars refuses and never calls Stripe", async () => {
  const { d, calls } = deps();
  const result = await runCheckout(d, { priceId: "price_attacker", newsletter: false });
  assert.deepEqual(result, { ok: false, error: "invalid_price" });
  assert.equal(calls.customers, 0);
  assert.equal(calls.sessions.length, 0);
  assert.deepEqual(await runCheckout(d, { priceId: "", newsletter: false }), { ok: false, error: "invalid_price" });
});

test("checkout is refused, without calling Stripe, when payments or SITE_URL are not configured", async () => {
  for (const env of [{}, { ...ENV, SITE_URL: undefined }, { ...ENV, STRIPE_PRICE_ANNUAL: undefined }]) {
    const { d, calls } = deps({ env });
    assert.deepEqual(await runCheckout(d, { priceId: "price_m", newsletter: false }), { ok: false, error: "not_configured" });
    assert.equal(calls.customers + calls.sessions.length, 0);
  }
});

test("a valid checkout creates a subscription session with the user, tier and newsletter choice", async () => {
  const { d, calls } = deps();
  const result = await runCheckout(d, { priceId: "price_m", newsletter: true });
  assert.deepEqual(result, { ok: true, url: "https://checkout.stripe.test/session" });
  assert.deepEqual(calls.attached, ["cus_new123456"]);
  const session = calls.sessions[0] as Record<string, unknown>;
  assert.equal(session.mode, "subscription");
  assert.equal(session.client_reference_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(session.success_url, "https://eye.example/account/billing");
  assert.equal(session.cancel_url, "https://eye.example/support");
  assert.deepEqual(session.metadata, { profile_id: "11111111-1111-4111-8111-111111111111", tier: "monthly", newsletter: "1" });
  assert.deepEqual(session.line_items, [{ price: "price_m", quantity: 1 }]);
});

test("the one-time price uses payment mode, and an existing supporter is turned away", async () => {
  const { d, calls } = deps();
  await runCheckout(d, { priceId: "price_o", newsletter: false });
  assert.equal((calls.sessions[0] as { mode: string }).mode, "payment");
  assert.equal((calls.sessions[0] as { metadata: { newsletter: string } }).metadata.newsletter, "0");

  const again = deps({ hasActiveMembership: async () => true });
  assert.deepEqual(await runCheckout(again.d, { priceId: "price_a", newsletter: false }), { ok: false, error: "already_supporter" });
  assert.equal(again.calls.sessions.length, 0);
});
