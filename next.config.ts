import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Avatar uploads are up to 2 MB plus multipart overhead.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
