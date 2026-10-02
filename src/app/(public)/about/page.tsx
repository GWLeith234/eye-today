import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };
export const dynamic = "force-static";

export default function AboutPage() {
  return <ContentPage file="about.md" title="About" />;
}
