import type { Metadata } from "next";
import Link from "next/link";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "Advertise", alternates: { canonical: "/advertise" } };

export default function AdvertisePage() {
  return (
    <StaticPage title="Advertise">
      <p>
        Eye Today offers display placements and clearly labelled sponsored content. Sponsored stories are always marked as such and are never written or edited by our newsroom. The rules are on the{" "}
        <Link href="/ad-policy" className="underline">ad policy</Link> page. Contact us for rates.
      </p>
    </StaticPage>
  );
}
