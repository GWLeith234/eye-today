import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Newsletter", alternates: { canonical: "/newsletter" } };

export default function NewsletterPage() {
  return (
    <StaticPage title="Newsletter">
      <p>Newsletter signup is not open yet. Check back soon.</p>
    </StaticPage>
  );
}
