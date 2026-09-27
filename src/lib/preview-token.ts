import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 60 * 60;

function sign(secret: string, articleId: string, exp: number) {
  return createHmac("sha256", secret).update(`preview:${articleId}:${exp}`).digest("base64url");
}

// "<exp>.<hmac>" — valid for one article for an hour. Null when PREVIEW_SECRET is unset.
export function mintPreviewToken(articleId: string, now = Date.now()): string | null {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return `${exp}.${sign(secret, articleId, exp)}`;
}

export function verifyPreviewToken(articleId: string, token: unknown, now = Date.now()): boolean {
  const secret = process.env.PREVIEW_SECRET;
  if (!secret || typeof token !== "string") return false;
  const match = token.match(/^(\d{1,12})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const exp = Number(match[1]);
  if (exp * 1000 <= now) return false;
  const expected = Buffer.from(sign(secret, articleId, exp));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
