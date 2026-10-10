import type Stripe from "stripe";

import { type Duration, type Env, POSTING_KIND, parseDuration, postingCheckoutOffered, postingPrices } from "./prices";

// One-time Stripe Checkout for a posting. No server-only import: the tests drive this with fakes.

export type PostingCheckoutError = "not_configured" | "invalid_duration" | "not_yours" | "not_payable" | "failed";
export type PostingCheckoutOutcome = { ok: true; url: string } | { ok: false; error: PostingCheckoutError };

export type PostingCheckoutDeps = {
  env: Env;
  userId: string;
  email: string | null;
  postingId: string;
  // The caller's own posting, or null.
  loadPosting: () => Promise<PayableState | null>;
  createSession: (params: Stripe.Checkout.SessionCreateParams) => Promise<string | null>;
  now?: Date;
};

export type PayableState = { status: string; paid_days: number; expires_at: string | null };

// What can be paid for: a draft (first payment), a live or expired posting (extend or renew), and a rejected
// or pending posting only when it holds no paid time — neither days waiting for approval nor unexpired time
// (an edited live posting sits in pending while its clock runs). Otherwise the poster would pay twice.
export function payable(posting: PayableState, now: number = Date.now()): boolean {
  const timeLeft = posting.expires_at !== null && new Date(posting.expires_at).getTime() > now;
  switch (posting.status) {
    case "draft":
    case "published":
    case "expired":
      return true;
    case "rejected":
      return posting.paid_days === 0;
    case "pending":
      return posting.paid_days === 0 && !timeLeft;
    default:
      return false;
  }
}

export async function runPostingCheckout(deps: PostingCheckoutDeps, durationInput: unknown): Promise<PostingCheckoutOutcome> {
  if (!postingCheckoutOffered(deps.env)) return { ok: false, error: "not_configured" };
  const days: Duration | null = parseDuration(durationInput);
  if (!days) return { ok: false, error: "invalid_duration" };
  const price = postingPrices(deps.env)[days]!;

  try {
    const posting = await deps.loadPosting();
    if (!posting) return { ok: false, error: "not_yours" };
    if (!payable(posting, (deps.now ?? new Date()).getTime())) return { ok: false, error: "not_payable" };

    const origin = (deps.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
    const metadata = { kind: POSTING_KIND, posting_id: deps.postingId, profile_id: deps.userId, days: String(days) };
    const url = await deps.createSession({
      mode: "payment",
      client_reference_id: deps.userId,
      customer_email: deps.email ?? undefined,
      line_items: [{ price, quantity: 1 }],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/account/postings?paid=1`,
      cancel_url: `${origin}/account/postings`,
    });
    return url ? { ok: true, url } : { ok: false, error: "failed" };
  } catch (error) {
    console.error(`posting checkout failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { ok: false, error: "failed" };
  }
}

export const POSTING_CHECKOUT_MESSAGES: Record<PostingCheckoutError, string> = {
  not_configured: "Paid posting isn’t open yet. Your draft is saved, and an editor can still publish it.",
  invalid_duration: "Choose 30 or 60 days.",
  not_yours: "That posting wasn’t found.",
  not_payable: "That posting already has paid time. Edit it and send it back for review instead of paying again.",
  failed: "We couldn’t start checkout. Nothing was charged. Please try again.",
};
