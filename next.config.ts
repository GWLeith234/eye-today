import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// The optimizer refuses private addresses unless told otherwise. Allow that only
// when the build points at a local Supabase stack, never for a hosted project.
const localSupabase = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(supabaseUrl);

const mediaPaths = ["/storage/v1/object/public/media/**", "/storage/v1/render/image/public/media/**"];

const nextConfig: NextConfig = {
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
};

export default nextConfig;
