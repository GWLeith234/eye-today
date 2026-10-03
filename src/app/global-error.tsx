"use client";

import Link from "next/link";

import { BRAND_HEX } from "@/lib/design/brand";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: BRAND_HEX.paper, color: BRAND_HEX.ink, fontFamily: "Georgia, 'Times New Roman', serif" }}>
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "4rem 1rem" }}>
          <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.85rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Eye Today</p>
          <h1 style={{ fontSize: "2.5rem", lineHeight: 1.15 }}>Something went wrong</h1>
          <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "1.125rem", lineHeight: 1.5 }}>
            The site hit an unexpected error. You can try again, or return to the front page.
          </p>
          <p style={{ fontFamily: "system-ui, sans-serif" }}>
            <button type="button" onClick={() => reset()} style={{ background: BRAND_HEX.ink, color: BRAND_HEX.paper, border: 0, borderRadius: "0.25rem", padding: "0.5rem 1rem", font: "inherit" }}>
              Try again
            </button>{" "}
            <Link href="/" style={{ color: BRAND_HEX.ink }}>Front page</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
