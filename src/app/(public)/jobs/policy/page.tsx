import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Posting policy", alternates: { canonical: "/jobs/policy" } };
export const dynamic = "force-static";

export default function PostingPolicyPage() {
  return <ContentPage file="posting-policy.md" title="Posting policy" />;
}
