import "server-only";

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type Stripe from "stripe";

// In-process Stripe. Checkout sessions are recorded; nothing is sent to Stripe.
// Customer ids match attach_stripe_customer's `cus_[A-Za-z0-9_]{6,64}` check.

const CUSTOMER_ID = "cus_e2eTestCustomer";

function logSession(entry: { customer: string | null; price: string | null; mode: string | null }) {
  const path = process.env.E2E_STRIPE_LOG?.trim();
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

export function createE2EStripe(): Stripe {
  const monthly = process.env.STRIPE_PRICE_MONTHLY?.trim() || "price_e2e_monthly";
  const once = process.env.STRIPE_PRICE_ONCE?.trim() || "price_e2e_once";
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  const api = {
    customers: {
      create: async () => ({ id: CUSTOMER_ID }),
    },
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          const price = params.line_items?.[0]?.price;
          logSession({
            customer: typeof params.customer === "string" ? params.customer : null,
            price: typeof price === "string" ? price : null,
            mode: params.mode ?? null,
          });
          return { id: "cs_e2e", url: "https://checkout.stripe.test/e2e-session" };
        },
        listLineItems: async () => ({ data: [{ price: { id: once } }] }),
      },
    },
    subscriptions: {
      retrieve: async (id: string) => ({
        id,
        status: "active",
        customer: CUSTOMER_ID,
        metadata: {},
        canceled_at: null,
        ended_at: null,
        items: {
          data: [
            {
              quantity: 1,
              price: { id: monthly, unit_amount: 800 },
              current_period_end: periodEnd,
            },
          ],
        },
      }),
    },
  };

  return api as unknown as Stripe;
}
