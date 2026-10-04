import type Stripe from "stripe";

// Featured listings: a monthly or annual Stripe subscription per listing. No server-only import:
// the tests drive runFeaturedCheckout with fakes, as they do for membership checkout.

export const FEATURED_KIND = "directory_feature";
export type FeaturedInterval = "monthly" | "annual";
type Env = Record<string, string | undefined>;

const clean = (value: string | undefined) => value?.trim() || null;

export function featuredPrices(env: Env): Record<FeaturedInterval, string | null> {
  return { monthly: clean(env.STRIPE_PRICE_FEATURED_MONTHLY), annual: clean(env.STRIPE_PRICE_FEATURED_ANNUAL) };
}

// Offered only with the secret key, SITE_URL (for the return links) and both featured prices.
// It does not depend on the supporter prices (STRIPE_PRICE_MONTHLY / ANNUAL / ONCE).
export function featuredOffered(env: Env): boolean {
  const prices = featuredPrices(env);
  return Boolean(clean(env.STRIPE_SECRET_KEY) && clean(env.SITE_URL) && prices.monthly && prices.annual);
}

export type FeaturedError = "not_configured" | "invalid_interval" | "not_owner" | "already_featured" | "failed";
export type FeaturedOutcome = { ok: true; url: string } | { ok: false; error: FeaturedError };

export type FeaturedDeps = {
  env: Env;
  userId: string;
  email: string | null;
  listingId: string;
  isOwner: () => Promise<boolean>;
  hasActiveFeature: () => Promise<boolean>;
  getStoredCustomer: () => Promise<string | null>;
  createCustomer: (params: { email?: string; metadata: Record<string, string> }) => Promise<string>;
  attachCustomer: (customerId: string) => Promise<void>;
  createSession: (params: Stripe.Checkout.SessionCreateParams) => Promise<string | null>;
};

export async function runFeaturedCheckout(deps: FeaturedDeps, interval: string): Promise<FeaturedOutcome> {
  if (!featuredOffered(deps.env)) return { ok: false, error: "not_configured" };
  if (interval !== "monthly" && interval !== "annual") return { ok: false, error: "invalid_interval" };
  const price = featuredPrices(deps.env)[interval]!;

  try {
    if (!(await deps.isOwner())) return { ok: false, error: "not_owner" };
    if (await deps.hasActiveFeature()) return { ok: false, error: "already_featured" };

    let customer = await deps.getStoredCustomer();
    if (!customer) {
      const created = await deps.createCustomer({ email: deps.email ?? undefined, metadata: { profile_id: deps.userId } });
      await deps.attachCustomer(created);
      customer = (await deps.getStoredCustomer()) ?? created;
    }

    const origin = (deps.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
    const metadata = { kind: FEATURED_KIND, listing_id: deps.listingId, profile_id: deps.userId };
    const url = await deps.createSession({
      mode: "subscription",
      customer,
      client_reference_id: deps.userId,
      line_items: [{ price, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: `${origin}/account/listings?featured=1`,
      cancel_url: `${origin}/account/listings`,
    });
    return url ? { ok: true, url } : { ok: false, error: "failed" };
  } catch (error) {
    console.error(`featured checkout failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { ok: false, error: "failed" };
  }
}

export const FEATURED_MESSAGES: Record<FeaturedError, string> = {
  not_configured: "Featured listings are not available yet.",
  invalid_interval: "That option is not available.",
  not_owner: "Only a verified owner can feature a listing.",
  already_featured: "This listing is already featured. Use Manage billing to change or cancel.",
  failed: "We couldn't start checkout. Nothing was charged. Please try again.",
};
