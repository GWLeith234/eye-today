import "server-only";

import Stripe from "stripe";

// One client per call site; null when the secret key is unset, so nothing reaches the network.
// An E2E_FULL build swaps in an in-process double. next.config inlines that flag, so a
// production build (the flag empty) drops the double and never reads the log path.
export function getStripe(): Stripe | null {
  if (process.env.E2E_FULL === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createE2EStripe } = require("./stripe-e2e") as typeof import("./stripe-e2e");
    return createE2EStripe();
  }
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}
