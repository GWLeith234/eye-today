import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/public/site";

// The web app manifest, served at /manifest.webmanifest. It is what turns "add to home screen" from a
// bookmark into an installed app: its own icon, no browser chrome, and a splash screen in the paper colour.
//
// theme_color and background_color are both the paper ground rather than the brand green, so the status bar
// and the splash blend into the page instead of banding across the top of every story.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#faf8f3",
    categories: ["news", "medical"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Padded so Android can crop it to a circle or a squircle without clipping the iris.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the installed icon to jump straight to a section.
    shortcuts: [
      { name: "The Latest", short_name: "Latest", url: "/news" },
      { name: "Ibogaine in the news", short_name: "News feed", url: "/news-feed" },
      { name: "Trials & Funding Tracker", short_name: "Tracker", url: "/tracker" },
      { name: "Legal Map", short_name: "Legal Map", url: "/legal-map" },
    ],
  };
}
