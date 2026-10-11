// Run-of-site pricing, named by environment variable. No server-only import: the tests load this file.

import { MAX_CAMPAIGN_MONTHS } from "./slots";

export type Env = Record<string, string | undefined>;
export const AD_KIND = "ad_campaign";

const clean = (value: string | undefined) => value?.trim() || null;

export function rosPrice(env: Env): string | null {
  return clean(env.STRIPE_PRICE_ROS_MONTHLY);
}

// Self-serve advertising is open only with the secret key, SITE_URL (return links) and the monthly price.
export function adCheckoutOffered(env: Env): boolean {
  return Boolean(clean(env.STRIPE_SECRET_KEY) && clean(env.SITE_URL) && rosPrice(env));
}

// Whole months, 1–12.
export function parseMonths(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_CAMPAIGN_MONTHS ? n : null;
}
