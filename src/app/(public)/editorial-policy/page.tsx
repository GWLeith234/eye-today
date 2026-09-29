import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Editorial policy", alternates: { canonical: "/editorial-policy" } };

export default function EditorialPolicyPage() {
  return (
    <StaticPage title="Editorial policy">
      <p>Our reporters verify facts with primary sources, disclose conflicts of interest on every story, and keep advertising and sponsorship separate from editorial decisions. Nothing we publish is medical advice.</p>
    </StaticPage>
  );
}
