// Route access rules shared by proxy.ts and the server layouts/pages.
// Pure functions only: this file is imported by the proxy.

export const APP_ROLES = ["reader", "supporter", "contributor", "editor", "admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];

const RANK: Record<AppRole, number> = {
  reader: 0,
  supporter: 0,
  contributor: 1,
  editor: 2,
  admin: 3,
};

export type Area = "account" | "contribute" | "admin" | "admin-users";

export const AREA_HOME: Record<Area, string> = {
  account: "/account",
  contribute: "/contribute",
  admin: "/admin",
  "admin-users": "/admin/users",
};

function isUnder(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function areaFor(pathname: string): Area | null {
  if (isUnder(pathname, "/admin/users")) return "admin-users";
  if (isUnder(pathname, "/admin")) return "admin";
  if (isUnder(pathname, "/contribute")) return "contribute";
  if (isUnder(pathname, "/account")) return "account";
  return null;
}

// Where to send someone who may not open `area`, or null when they may.
// A signed-in user with no profile row is treated as a reader.
export function redirectFor(area: Area, signedIn: boolean, role: AppRole | null): string | null {
  if (!signedIn) return "/login";
  const rank = RANK[role ?? "reader"];

  switch (area) {
    case "account":
      return null;
    case "contribute":
      return rank >= RANK.contributor ? null : "/account";
    case "admin":
      if (rank >= RANK.editor) return null;
      return rank === RANK.contributor ? "/contribute" : "/account";
    case "admin-users":
      if (role === "admin") return null;
      return redirectFor("admin", signedIn, role) ?? "/admin";
  }
}

// Only same-origin relative paths: one leading "/", never "//" or "/\".
export function safeNextPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  return value;
}

export function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}
