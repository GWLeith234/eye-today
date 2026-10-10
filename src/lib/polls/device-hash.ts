import { createHash } from "node:crypto";

// Salted sha256 of a signed-out voter's random cookie token. No server-only import: the tests load this file.
export function deviceHash(token: string, salt = process.env.VIEW_HASH_SALT || "eye-today-view"): string {
  return createHash("sha256").update(`poll:${salt}:${token}`).digest("hex");
}
