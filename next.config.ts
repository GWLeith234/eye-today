import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-side HTML generation and sanitizing use a DOM implementation; keep them out of the bundle.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom", "@tiptap/html", "happy-dom"],
  experimental: {
    // Avatar uploads are up to 2 MB plus multipart overhead.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
