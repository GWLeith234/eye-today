import "server-only";

import Stripe from "stripe";

import { createMockStripe, mockStripeDir } from "./stripe-mock";

// One client per call site; null when the secret key is unset, so nothing reaches the network.
// STRIPE_PROVIDER=mock (end-to-end tests only, needs E2E_RECORD_DIR) swaps in a recording double.
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  const mockDir = mockStripeDir();
  return mockDir ? createMockStripe(mockDir) : new Stripe(key);
}
