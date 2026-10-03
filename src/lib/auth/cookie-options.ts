// Session cookies are Secure only on an https site. `next start` is a production
// build, but the full e2e suite (and local `next start`) is plain http. Marking
// those cookies Secure makes the browser drop them, so sign-in never sticks.
export function sessionCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  const site = env.SITE_URL?.trim() ?? "";
  const secure = site.length > 0 ? site.startsWith("https://") : env.NODE_ENV === "production";
  return { path: "/", sameSite: "lax" as const, secure };
}
