import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  return (
    <StaticPage title="Contact">
      <p>To reach the newsroom with a tip, a question or feedback, email the editors. We read every message, and we protect sources who ask us to.</p>
    </StaticPage>
  );
}
