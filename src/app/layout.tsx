import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.SITE_URL;

export const metadata: Metadata = {
  // Absolute canonical and share URLs when the public origin is pinned.
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: "Eye Today", template: "%s — Eye Today" },
  description: "News, research and stories about eye health.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
