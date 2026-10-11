import type Stripe from "stripe";

import { AD_KIND, type Env, adCheckoutOffered, parseMonths, rosPrice } from "./prices";

// One-time Stripe Checkout for a run-of-site campaign: the monthly price × the number of months.
// No server-only import: the tests drive this with fakes.

export type AdCheckoutError = "not_configured" | "invalid_months" | "not_yours" | "no_creatives" | "not_payable" | "failed";
export type AdCheckoutOutcome = { ok: true; url: string } | { ok: false; error: AdCheckoutError };

export type PayableCampaign = { status: string; paid_at: string | null; creatives: number };

export type AdCheckoutDeps = {
  env: Env;
  userId: string;
  email: string | null;
  campaignId: string;
  // The caller's own campaign, or null.
  loadCampaign: () => Promise<PayableCampaign | null>;
  createSession: (params: Stripe.Checkout.SessionCreateParams) => Promise<string | null>;
};

// Only an unpaid draft with at least one creative can be paid for; everything after payment is the
// editor's to approve, and a paid campaign is never charged twice.
export function campaignPayable(campaign: PayableCampaign): AdCheckoutError | null {
  if (campaign.status !== "draft" || campaign.paid_at) return "not_payable";
  if (campaign.creatives < 1) return "no_creatives";
  return null;
}

export async function runAdCheckout(deps: AdCheckoutDeps, monthsInput: unknown): Promise<AdCheckoutOutcome> {
  if (!adCheckoutOffered(deps.env)) return { ok: false, error: "not_configured" };
  const months = parseMonths(monthsInput);
  if (!months) return { ok: false, error: "invalid_months" };
  const price = rosPrice(deps.env)!;

  try {
    const campaign = await deps.loadCampaign();
    if (!campaign) return { ok: false, error: "not_yours" };
    const blocked = campaignPayable(campaign);
    if (blocked) return { ok: false, error: blocked };

    const origin = (deps.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
    const metadata = { kind: AD_KIND, campaign_id: deps.campaignId, profile_id: deps.userId, months: String(months) };
    const url = await deps.createSession({
      mode: "payment",
      client_reference_id: deps.userId,
      customer_email: deps.email ?? undefined,
      line_items: [{ price, quantity: months }],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/account/advertise/${deps.campaignId}?paid=1`,
      cancel_url: `${origin}/account/advertise/${deps.campaignId}`,
    });
    return url ? { ok: true, url } : { ok: false, error: "failed" };
  } catch (error) {
    console.error(`ad checkout failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { ok: false, error: "failed" };
  }
}

export const AD_CHECKOUT_MESSAGES: Record<AdCheckoutError, string> = {
  not_configured: "Self-serve advertising isn’t open yet. Your campaign is saved; write to advertise@theeye.today and we’ll set it live by hand.",
  invalid_months: "Choose between 1 and 12 months.",
  not_yours: "That campaign wasn’t found.",
  no_creatives: "Upload at least one creative before paying.",
  not_payable: "That campaign has already been paid for.",
  failed: "We couldn’t start checkout. Nothing was charged. Please try again.",
};
