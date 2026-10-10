import "server-only";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { deviceHash } from "./device-hash";

// Signed-out voters are told apart by a random token in an httpOnly cookie. Only a salted sha256 of it is
// stored, never the token or an IP address.
export const DEVICE_COOKIE = "et_voter";
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

// Read-only (pages, reads): the existing hash or null.
export async function readDeviceHash(): Promise<string | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  return token && TOKEN.test(token) ? deviceHash(token) : null;
}

// In a server action: the existing hash, or set a new cookie and return its hash.
export async function ensureDeviceHash(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && TOKEN.test(existing)) return deviceHash(existing);
  const token = randomBytes(32).toString("base64url");
  jar.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.SITE_URL ?? "").startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return deviceHash(token);
}
