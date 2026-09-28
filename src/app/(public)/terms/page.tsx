import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <StaticPage title="Terms of use">
      <p>By using Eye Today you agree to use the site lawfully and not to republish our work without permission. Content is provided for information only and is not medical or legal advice.</p>
    </StaticPage>
  );
}
