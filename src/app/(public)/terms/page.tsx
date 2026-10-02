import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };
export const dynamic = "force-static";

export default function TermsPage() {
  return <ContentPage file="terms.md" title="Terms of use" />;
}
