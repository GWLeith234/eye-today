import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createE2EStripe } from "./stripe-e2e";

const CUSTOMER = /^cus_[A-Za-z0-9_]{6,64}$/;

test("the e2e Stripe double records the checkout price and customer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eye-stripe-"));
  const path = join(dir, "stripe.jsonl");
  const saved = { log: process.env.E2E_STRIPE_LOG, price: process.env.STRIPE_PRICE_MONTHLY };
  process.env.E2E_STRIPE_LOG = path;
  process.env.STRIPE_PRICE_MONTHLY = "price_e2e_monthly";
  try {
    const stripe = createE2EStripe();
    const customer = await stripe.customers.create({ email: "reader@example.com" });
    assert.match(customer.id, CUSTOMER);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      line_items: [{ price: "price_e2e_monthly", quantity: 1 }],
      success_url: "http://127.0.0.1:3000/account/billing",
      cancel_url: "http://127.0.0.1:3000/support",
    });
    assert.equal(session.url, "https://checkout.stripe.test/e2e-session");
    const row = JSON.parse(readFileSync(path, "utf8").trim()) as { customer: string; price: string; mode: string };
    assert.equal(row.customer, customer.id);
    assert.equal(row.price, "price_e2e_monthly");
    assert.equal(row.mode, "subscription");
  } finally {
    if (saved.log === undefined) delete process.env.E2E_STRIPE_LOG;
    else process.env.E2E_STRIPE_LOG = saved.log;
    if (saved.price === undefined) delete process.env.STRIPE_PRICE_MONTHLY;
    else process.env.STRIPE_PRICE_MONTHLY = saved.price;
  }
});
