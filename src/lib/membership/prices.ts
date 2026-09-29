// The three Stripe prices, named by environment variable. A checkout is only ever created for one of these.
// No server-only import: the tests load this file.

export const TIER_SLUGS = ["monthly", "annual", "once"] as const;
export type TierSlug = (typeof TIER_SLUGS)[number];

export type Env = Record<string, string | undefined>;

const PRICE_VARS: Record<TierSlug, string> = {
  monthly: "STRIPE_PRICE_MONTHLY",
  annual: "STRIPE_PRICE_ANNUAL",
  once: "STRIPE_PRICE_ONCE",
};

const clean = (value: string | undefined) => value?.trim() || null;

export function priceIds(env: Env): Record<TierSlug, string | null> {
  return { monthly: clean(env[PRICE_VARS.monthly]), annual: clean(env[PRICE_VARS.annual]), once: clean(env[PRICE_VARS.once]) };
}

// Payments are open only with the secret key and all three prices.
export function paymentsOpen(env: Env): boolean {
  const ids = priceIds(env);
  return Boolean(clean(env.STRIPE_SECRET_KEY) && ids.monthly && ids.annual && ids.once);
}

// Checkout also needs SITE_URL for its return links.
export function checkoutConfigured(env: Env): boolean {
  return paymentsOpen(env) && Boolean(clean(env.SITE_URL));
}

export function tierForPrice(env: Env, priceId: string | null | undefined): TierSlug | null {
  if (!priceId) return null;
  const ids = priceIds(env);
  return TIER_SLUGS.find((slug) => ids[slug] === priceId) ?? null;
}

export const modeFor = (slug: TierSlug): "subscription" | "payment" => (slug === "once" ? "payment" : "subscription");
