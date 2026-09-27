// Public origin of this deployment, used for auth redirect URLs.
// SITE_URL pins it; otherwise it comes from the (proxied) request headers.
// Supabase's redirect allow list rejects any origin it does not know.
export function originFromHeaders(headers: Headers): string {
  const pinned = process.env.SITE_URL;
  if (pinned) return pinned.replace(/\/+$/, "");

  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "127.0.0.1:3000";
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
