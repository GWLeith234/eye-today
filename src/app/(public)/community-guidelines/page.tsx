import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Community guidelines", alternates: { canonical: "/community-guidelines" } };
export const dynamic = "force-static";

export default function CommunityGuidelinesPage() {
  return <ContentPage file="community-guidelines.md" title="Community guidelines" />;
}
