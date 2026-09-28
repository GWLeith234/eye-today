import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Corrections", alternates: { canonical: "/corrections" } };

export default function CorrectionsPage() {
  return (
    <StaticPage title="Corrections">
      <p>When we get something wrong we fix it promptly and note the correction on the story. To report an error, contact the editors with the story link and what needs correcting.</p>
    </StaticPage>
  );
}
