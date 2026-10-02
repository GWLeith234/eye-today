import type Stripe from "stripe";

import { checkoutConfigured, type Env, modeFor, tierForPrice } from "./prices";

// No server-only import: the tests drive this with fakes. The action wires in the real Stripe client.

export type CheckoutError = "not_configured" | "invalid_price" | "already_supporter" | "failed" | "rate_limited";
export type CheckoutOutcome = { ok: true; url: string } | { ok: false; error: CheckoutError };

export type CheckoutDeps = {
  env: Env;
  userId: string;
  email: string | null;
  createCustomer: (params: { email?: string; metadata: Record<string, string> }) => Promise<string>;
  createSession: (params: Stripe.Checkout.SessionCreateParams) => Promise<string | null>;
  getStoredCustomer: () => Promise<string | null>;
  attachCustomer: (customerId: string) => Promise<void>;
  hasActiveMembership: () => Promise<boolean>;
};

// Creates a Checkout Session for one of the three configured prices, or refuses without calling
// Stripe. The price id comes from the browser, so it is only ever matched against the environment.
export async function runCheckout(deps: CheckoutDeps, input: { priceId: string; newsletter: boolean }): Promise<CheckoutOutcome> {
  if (!checkoutConfigured(deps.env)) return { ok: false, error: "not_configured" };
  const tier = tierForPrice(deps.env, input.priceId);
  if (!tier) return { ok: false, error: "invalid_price" };

  try {
    if (await deps.hasActiveMembership()) return { ok: false, error: "already_supporter" };

    let customer = await deps.getStoredCustomer();
    if (!customer) {
      const created = await deps.createCustomer({ email: deps.email ?? undefined, metadata: { profile_id: deps.userId } });
      await deps.attachCustomer(created);
      // If two checkouts raced, the stored customer wins.
      customer = (await deps.getStoredCustomer()) ?? created;
    }

    const origin = (deps.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
    const metadata = { profile_id: deps.userId, tier, newsletter: input.newsletter ? "1" : "0" };
    const mode = modeFor(tier);
    const url = await deps.createSession({
      mode,
      customer,
      client_reference_id: deps.userId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      metadata,
      ...(mode === "subscription" ? { subscription_data: { metadata } } : {}),
      success_url: `${origin}/account/billing`,
      cancel_url: `${origin}/support`,
    });
    return url ? { ok: true, url } : { ok: false, error: "failed" };
  } catch (error) {
    console.error(`checkout failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { ok: false, error: "failed" };
  }
}

export const CHECKOUT_MESSAGES: Record<CheckoutError, string> = {
  not_configured: "Payments are not configured yet.",
  invalid_price: "That option is not available.",
  already_supporter: "You are already a supporter. Use Manage billing to change or cancel.",
  failed: "We couldn't start checkout. Nothing was charged. Please try again.",
  rate_limited: "Too many checkout attempts. Wait a few minutes and try again. Nothing was charged.",
};
