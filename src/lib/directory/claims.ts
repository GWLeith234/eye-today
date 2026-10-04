import { randomInt } from "node:crypto";

import { sha256Hex } from "@/lib/newsletter/tokens";

// Pure helpers for listing claims. No server-only import: the tests load this file.

// Eight digits, from the OS random source. Only its sha256 is stored (listing_claims.code_hash).
export function newClaimCode(): { code: string; hash: string } {
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  return { code, hash: sha256Hex(code) };
}

// People paste codes with spaces or dashes ("1234 5678"). The database compares the trimmed text.
export function normalizeClaimCode(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function websiteHost(website: string | null | undefined): string | null {
  const match = /^https:\/\/([^/:?#\s]+)/i.exec((website ?? "").trim());
  return match ? match[1].toLowerCase() : null;
}

// Same rule as request_listing_claim in 0014: the mailbox domain equals the website host, or that
// host without a leading "www.". Used to explain the rule before anything is sent.
export function emailMatchesWebsite(email: string, website: string | null | undefined): boolean {
  const host = websiteHost(website);
  if (!host) return false;
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return domain === host || domain === host.replace(/^www\./, "");
}

export const CLAIM_MESSAGES: Record<string, string> = {
  domain: "That address is not at the listing's website domain. Use an address at the same domain, or ask an editor to review your claim.",
  invalid: "Check the email address. Only published listings can be claimed.",
  limit: "Too many attempts. Wait a few minutes and try again.",
  owner: "You already manage this listing.",
  pending: "You already have a claim waiting for an editor.",
  mail: "We could not send the code. Please try again in a few minutes.",
  unavailable: "Claims are not available right now.",
  bad_code: "That code did not work. It may have expired. You can ask for a new one.",
};

// Maps the message a claim function raised to a key above. Never says more than the message does.
export function claimErrorKey(error: { code?: string; message?: string } | null | undefined): keyof typeof CLAIM_MESSAGES {
  const message = error?.message ?? "";
  if (message === "domain mismatch") return "domain";
  if (message === "too many claims") return "limit";
  if (message === "already owner") return "owner";
  if (message === "claim pending") return "pending";
  if (error?.code === "23514") return "invalid";
  return "unavailable";
}
