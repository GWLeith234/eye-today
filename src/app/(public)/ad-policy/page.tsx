import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Ad policy", alternates: { canonical: "/ad-policy" } };
export const dynamic = "force-static";

export default function AdPolicyPage() {
  return <ContentPage file="ad-policy.md" title="Ad policy" />;
}
