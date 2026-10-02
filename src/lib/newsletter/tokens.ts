import { createHash, createHmac, randomBytes } from "node:crypto";

// Pure helpers. No server-only import so the tests can load this file directly.

const HEX64 = /^[0-9a-f]{64}$/;
// Raw tokens travel in URLs: base64url (confirm) or hex (unsubscribe).
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,128}$/;

export const CONFIRM_TTL_HOURS = 48;

export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

export const isHash = (value: string) => HEX64.test(value);
export const isTokenShape = (value: unknown): value is string => typeof value === "string" && TOKEN_SHAPE.test(value);

// 32 random bytes. Only the sha256 of this is stored; the raw value lives in the email.
export function newConfirmToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256Hex(raw) };
}

// The unsubscribe token for a subscriber, derived from the secret and their stored confirm
// hash. It never changes for a given confirmation, so every issue carries the same working
// link, and only the hash of it is stored (at confirm time). It signs nothing else.
export function unsubscribeToken(linkSecret: string, confirmHash: string) {
  const raw = createHmac("sha256", linkSecret).update(`unsubscribe:${confirmHash}`).digest("hex");
  return { raw, hash: sha256Hex(raw) };
}

// ip_hash: sha256 of "<salt>:<first x-forwarded-for address>". The raw address is never stored.
export function hashIp(forwardedFor: string | null | undefined, salt: string | undefined): string {
  const first = (forwardedFor ?? "").split(",")[0]?.trim() ?? "";
  return sha256Hex(`${salt?.trim() || "eye-today-view"}:${first}`);
}
