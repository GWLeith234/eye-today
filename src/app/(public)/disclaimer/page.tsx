import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Disclaimer", alternates: { canonical: "/disclaimer" } };
export const dynamic = "force-static";

export default function DisclaimerPage() {
  return <ContentPage file="disclaimer.md" title="Disclaimer" />;
}
