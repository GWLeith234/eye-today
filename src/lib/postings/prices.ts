// Posting prices, named by environment variable. No server-only import: the tests load this file.

export type Env = Record<string, string | undefined>;
export const POSTING_KIND = "posting";
export const DURATIONS = [30, 60] as const;
export type Duration = (typeof DURATIONS)[number];

const clean = (value: string | undefined) => value?.trim() || null;

export function postingPrices(env: Env): Record<Duration, string | null> {
  return { 30: clean(env.STRIPE_PRICE_POSTING_30), 60: clean(env.STRIPE_PRICE_POSTING_60) };
}

// Paid posting is open only with the secret key, SITE_URL (return links) and both prices.
export function postingCheckoutOffered(env: Env): boolean {
  const prices = postingPrices(env);
  return Boolean(clean(env.STRIPE_SECRET_KEY) && clean(env.SITE_URL) && prices[30] && prices[60]);
}

export function parseDuration(value: unknown): Duration | null {
  return value === "30" || value === 30 ? 30 : value === "60" || value === 60 ? 60 : null;
}
