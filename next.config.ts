import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/http/security-headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// The optimizer refuses private addresses unless told otherwise. Allow that only
// when the build points at a local Supabase stack, never for a hosted project.
const localSupabase = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(supabaseUrl);

const mediaPaths = ["/storage/v1/object/public/media/**", "/storage/v1/render/image/public/media/**"];

const nextConfig: NextConfig = {
  // Inlined into the server bundle. The test session route is compiled in only
  // when a build is started with E2E_FULL=1. A Railway build leaves this empty,
  // and setting the variable later at runtime cannot turn the route on.
  env: {
    E2E_FULL: process.env.E2E_FULL === "1" ? "1" : "",
  },
  images: {
    remotePatterns: [
      ...mediaPaths.map((pathname) => ({ protocol: "https" as const, hostname: "*.supabase.co", pathname })),
      ...mediaPaths.map((pathname) => ({ protocol: "http" as const, hostname: "127.0.0.1", pathname })),
    ],
    ...(localSupabase ? { dangerouslyAllowLocalIP: true } : {}),
  },
  // Server-side HTML generation and sanitizing use a DOM implementation; keep them out of the bundle.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom", "@tiptap/html", "happy-dom"],
  experimental: {
    // Avatar uploads are up to 2 MB plus multipart overhead.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

function withOptionalSentry(config: NextConfig): NextConfig {
  const token = process.env.SENTRY_AUTH_TOKEN?.trim();
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  if (!token || !org || !project) return config;
  // Loaded only when source maps should upload. A missing token must not change the build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require("@sentry/nextjs/config") as typeof import("@sentry/nextjs/config");
  return withSentryConfig(config, {
    org,
    project,
    authToken: token,
    silent: true,
    telemetry: false,
  });
}

export default withOptionalSentry(nextConfig);
