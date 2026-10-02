import type { Metadata } from "next";

import { NewsletterForm } from "@/components/public/newsletter-form";
import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Newsletter", alternates: { canonical: "/newsletter" } };

export default function NewsletterPage() {
  return (
    <StaticPage title="Newsletter">
      <p>
        Get Eye Today by email: the Daily Brief each morning, or the Weekly Roundup once a week. Every message has a one-click
        unsubscribe link.
      </p>
      <div className="mt-6 text-base">
        <NewsletterForm />
      </div>
    </StaticPage>
  );
}
