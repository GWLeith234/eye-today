// Response headers shared by next.config and proxy redirects.
// CSP stays report-only: Next.js injects inline scripts, so an enforced policy
// would need 'unsafe-inline' and would still be a weak enforcement mode.

export type SecurityHeader = { key: string; value: string };

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://plausible.io https://*.sentry.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://platform.twitter.com https://www.instagram.com https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://plausible.io https://*.ingest.sentry.io https://*.sentry.io",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// https://<key>@<host>/<project> → https://<host>/api/<project>/security/?sentry_key=<key>
export function sentryCspReportUri(dsn: string | undefined): string | null {
  const trimmed = dsn?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const key = decodeURIComponent(url.username);
    const project = url.pathname.replace(/^\/+/, "").split("/")[0];
    if (url.protocol !== "https:" || !key || !project || !/^\d+$/.test(project)) return null;
    return `https://${url.host}/api/${project}/security/?sentry_key=${encodeURIComponent(key)}`;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(env: NodeJS.ProcessEnv = process.env): string {
  const report = sentryCspReportUri(env.SENTRY_DSN);
  return report ? `${CSP}; report-uri ${report}` : CSP;
}

export function securityHeaders(env: NodeJS.ProcessEnv = process.env): SecurityHeader[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(env) },
  ];
}

export function applySecurityHeaders(headers: Headers, env: NodeJS.ProcessEnv = process.env) {
  for (const header of securityHeaders(env)) {
    if (!headers.has(header.key)) headers.set(header.key, header.value);
  }
}
