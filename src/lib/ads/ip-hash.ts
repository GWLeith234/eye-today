import "server-only";

import { createHash } from "node:crypto";

// Same rule as article views (/api/view): a salted hash of the first forwarded address.
export function adIpHash(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const salt = process.env.VIEW_HASH_SALT || "eye-today-view";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}
