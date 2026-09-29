import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <StaticPage title="Privacy">
      <p>We collect only what we need to run the site. Article views are counted using a salted hash of your network address, never the address itself, and we do not sell personal information.</p>
    </StaticPage>
  );
}
