import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/public/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/contribute", "/login", "/preview", "/api", "/auth"],
    },
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl("/news-sitemap.xml")],
  };
}
