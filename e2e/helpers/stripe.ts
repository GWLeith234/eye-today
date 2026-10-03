import Stripe from "stripe";

import { type StripeCall, readStripeCalls } from "../../src/lib/membership/stripe-mock";
import { e2eEnv } from "./guard";

export const stripeCalls = () => readStripeCalls(e2eEnv().recordDir);

export function checkoutSessionsFor(userId: string): StripeCall[] {
  return stripeCalls().filter((call) => call.op === "checkout.sessions.create" && call.params.client_reference_id === userId);
}

// A signed event body for POST /api/webhooks/stripe. The route verifies it with the real Stripe library.
export function signedEvent(event: { id: string; type: string; object: Record<string, unknown> }) {
  const payload = JSON.stringify({
    id: event.id,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    type: event.type,
    data: { object: event.object },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: e2eEnv().stripeWebhookSecret });
  return { payload, headers: { "stripe-signature": header, "content-type": "application/json" } };
}
