#!/usr/bin/env node
// Creates the Stripe product and three CAD prices for supporter membership, in TEST mode only.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-seed.mjs
//
// It prints the three price ids and writes nothing else: copy them into the environment
// (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, STRIPE_PRICE_ONCE) and into
// membership_tiers.stripe_price_id. Running it twice creates a second product and set of prices.
// Not part of `npm test` or the build. The amounts match the tiers seeded by 0009_membership.sql.

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set. Nothing was created.");
  process.exit(1);
}
if (key.startsWith("sk_live_")) {
  console.error("Refusing to run with a live key (sk_live_...). Use a test-mode key. Nothing was created.");
  process.exit(1);
}

const stripe = new Stripe(key);

const product = await stripe.products.create({
  name: "Eye Today Supporter",
  description: "Reader support for Eye Today.",
});

const common = { product: product.id, currency: "cad" };
const monthly = await stripe.prices.create({ ...common, unit_amount: 800, recurring: { interval: "month" }, nickname: "Monthly supporter" });
const annual = await stripe.prices.create({ ...common, unit_amount: 8000, recurring: { interval: "year" }, nickname: "Annual supporter" });
const once = await stripe.prices.create({ ...common, unit_amount: 2500, nickname: "One-time gift" });

console.log(`Product ${product.id} created (test mode).\n`);
console.log("Add these to the environment:");
console.log(`STRIPE_PRICE_MONTHLY=${monthly.id}`);
console.log(`STRIPE_PRICE_ANNUAL=${annual.id}`);
console.log(`STRIPE_PRICE_ONCE=${once.id}`);
console.log("\nAnd record them on the tiers:");
console.log(`update public.membership_tiers set stripe_price_id = '${monthly.id}' where slug = 'monthly';`);
console.log(`update public.membership_tiers set stripe_price_id = '${annual.id}' where slug = 'annual';`);
console.log(`update public.membership_tiers set stripe_price_id = '${once.id}' where slug = 'once';`);
