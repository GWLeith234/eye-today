import type { MembershipStatus } from "./roles";

// Stripe subscription status -> membership status. null means "not a membership (yet)".
export function membershipStatusFrom(stripeStatus: string): MembershipStatus | null {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
    case "incomplete_expired":
    case "paused":
      return "expired";
    default:
      return null; // incomplete: nothing has been paid
  }
}

const day = 86_400_000;
export const RETRY_GRACE_MS = 3 * day;

// While a payment is failing, Stripe still reports the old period end, which is already past. The
// supporter rule only keeps a past_due membership inside its period, so a past_due period end is
// pushed out to the next retry (or a short grace) and never pulled back in by a later event.
export function pastDuePeriodEnd(existing: Date | null, incoming: Date | null, nextAttempt: Date | null, now: Date): Date {
  const known = [existing, incoming, nextAttempt].filter((d): d is Date => d !== null);
  const latest = known.length ? new Date(Math.max(...known.map((d) => d.getTime()))) : null;
  // Nothing in the future to hold on to: give a short grace from now.
  return latest && latest.getTime() > now.getTime() ? latest : new Date(now.getTime() + RETRY_GRACE_MS);
}
