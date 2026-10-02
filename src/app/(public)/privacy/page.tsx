import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Privacy", alternates: { canonical: "/privacy" } };
export const dynamic = "force-static";

export default function PrivacyPage() {
  return <ContentPage file="privacy.md" title="Privacy" />;
}
