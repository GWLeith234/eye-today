import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Corrections", alternates: { canonical: "/corrections" } };
export const dynamic = "force-static";

export default function CorrectionsPage() {
  return <ContentPage file="corrections.md" title="Corrections" />;
}
