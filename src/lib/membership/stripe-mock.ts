import type Stripe from "stripe";

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

// Test double for the Stripe client. Selected by STRIPE_PROVIDER=mock and only honoured when
// E2E_RECORD_DIR names a directory. It answers the four calls the app makes and writes each
// one to <dir>/stripe.jsonl so the end-to-end tests can assert what was requested. Webhook
// signatures are not mocked: the route still verifies them with the real library.
// No server-only import: the tests load this file directly.

type Env = Record<string, string | undefined>;

export type StripeCall = {
  at: string;
  op: "customers.create" | "checkout.sessions.create";
  params: Record<string, unknown>;
  result: { id: string; url?: string; subscription?: string };
};

export function mockStripeDir(env: Env = process.env): string | null {
  if (env.STRIPE_PROVIDER?.trim() !== "mock") return null;
  return env.E2E_RECORD_DIR?.trim() || null;
}

const file = (dir: string) => join(dir, "stripe.jsonl");

export function readStripeCalls(dir: string): StripeCall[] {
  try {
    return readFileSync(file(dir), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StripeCall);
  } catch {
    return [];
  }
}

function record(dir: string, call: Omit<StripeCall, "at">) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(file(dir), `${JSON.stringify({ at: new Date().toISOString(), ...call })}\n`);
}

const sessionCalls = (dir: string) => readStripeCalls(dir).filter((call) => call.op === "checkout.sessions.create");
const priceOf = (call: StripeCall) => {
  const items = call.params.line_items as { price: string }[] | undefined;
  return items?.[0]?.price ?? null;
};

export function createMockStripe(dir: string): Stripe {
  const double = {
    customers: {
      create: async (params: Record<string, unknown>) => {
        const id = `cus_mock_${randomUUID().slice(0, 8)}`;
        record(dir, { op: "customers.create", params, result: { id } });
        return { id };
      },
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          const suffix = randomUUID().slice(0, 8);
          const id = `cs_test_mock_${suffix}`;
          const result = {
            id,
            url: `https://checkout.stripe.invalid/c/pay/${id}`,
            ...(params.mode === "subscription" ? { subscription: `sub_mock_${suffix}` } : {}),
          };
          record(dir, { op: "checkout.sessions.create", params, result });
          return { id, url: result.url };
        },
        listLineItems: async (sessionId: string) => {
          const call = sessionCalls(dir).find((c) => c.result.id === sessionId);
          const price = call ? priceOf(call) : null;
          return { data: price ? [{ price: { id: price } }] : [] };
        },
      },
    },
    subscriptions: {
      retrieve: async (subscriptionId: string) => {
        const call = sessionCalls(dir).find((c) => c.result.subscription === subscriptionId);
        if (!call) throw new Error(`mock stripe: unknown subscription ${subscriptionId}`);
        const subscriptionData = call.params.subscription_data as { metadata?: Record<string, string> } | undefined;
        return {
          id: subscriptionId,
          object: "subscription",
          customer: call.params.customer,
          status: "active",
          metadata: subscriptionData?.metadata ?? {},
          ended_at: null,
          canceled_at: null,
          items: {
            data: [{ price: { id: priceOf(call), unit_amount: 800 }, quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400 }],
          },
        };
      },
    },
  };
  return double as unknown as Stripe;
}
