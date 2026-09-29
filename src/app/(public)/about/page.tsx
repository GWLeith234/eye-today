import type { Metadata } from "next";

import { StaticPage } from "@/components/public/static-page";

export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <StaticPage title="About">
      <p>Eye Today is an independent newsroom covering ibogaine, psychedelic medicine and the people, policy and science around them. We report for readers who want careful, sourced journalism rather than hype.</p>
    </StaticPage>
  );
}
