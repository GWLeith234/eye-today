import type { Metadata } from "next";
import { Fraunces, Inter, Source_Serif_4 } from "next/font/google";

import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/public/site";

import "./globals.css";

// next/font downloads these at build time and serves them from our own origin: no runtime font requests.
// Each exposes a CSS variable that globals.css maps to --font-display / --font-serif / --font-sans.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap", style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const siteUrl = siteOrigin();

export const metadata: Metadata = {
  // Absolute canonical and share URLs when the public origin is pinned.
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  alternates: { types: { "application/rss+xml": "/rss.xml" } },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${sourceSerif.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
