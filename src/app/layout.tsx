import type { Metadata } from "next";
import { Fraunces, Inter, Source_Serif_4 } from "next/font/google";

import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/public/site";

import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700"],
  variable: "--font-source-serif",
});

const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
});

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
    <html lang="en" className={`${sans.variable} ${serif.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
