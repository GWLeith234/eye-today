import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Editorial policy", alternates: { canonical: "/editorial-policy" } };
export const dynamic = "force-static";

export default function EditorialPolicyPage() {
  return <ContentPage file="editorial-policy.md" title="Editorial policy" />;
}
