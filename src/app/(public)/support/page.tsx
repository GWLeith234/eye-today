import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Support us", alternates: { canonical: "/support" } };

export default function SupportPage() {
  return (
    <StaticPage title="Support us">
      <p>Payments are not open yet. When reader support launches, you will be able to contribute here.</p>
    </StaticPage>
  );
}
