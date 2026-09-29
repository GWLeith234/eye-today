import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/public/site";

import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
