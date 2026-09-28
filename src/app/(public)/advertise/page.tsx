import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Advertise", alternates: { canonical: "/advertise" } };

export default function AdvertisePage() {
  return (
    <StaticPage title="Advertise">
      <p>Eye Today offers display placements and clearly labelled sponsored content. Sponsored stories are always marked as such and are never written or edited by our newsroom. Contact us for rates.</p>
    </StaticPage>
  );
}
