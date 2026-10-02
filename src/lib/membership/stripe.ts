import "server-only";

import Stripe from "stripe";

// One client per call site; null when the secret key is unset, so nothing reaches the network.
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}
