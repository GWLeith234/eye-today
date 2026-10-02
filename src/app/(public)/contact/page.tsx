import type { Metadata } from "next";

import { ContentPage } from "@/components/public/content-page";

export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };
export const dynamic = "force-static";

export default function ContactPage() {
  return <ContentPage file="contact.md" title="Contact" />;
}
