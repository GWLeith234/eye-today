import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { isReservedSectionSlug } from "@/lib/public/reserved";
import { SITE_NAME } from "@/lib/public/site";
import { createAnonClient } from "@/lib/supabase/anon";

// A static string: file-based image metadata cannot vary alt per article.
export const alt = `Story card from ${SITE_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card: section, headline, masthead. next/og's built-in font; nothing fetched.
// RLS on the anon client returns live articles only.
export default async function Image({ params }: { params: Promise<{ section: string; slug: string }> }) {
  const { section, slug } = await params;
  if (isReservedSectionSlug(section)) notFound();
  const supabase = createAnonClient();
  if (!supabase) notFound();
  const { data: article } = await supabase
    .from("articles")
    .select("title, is_sponsored, sections(slug, name)")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle<{ title: string; is_sponsored: boolean; sections: { slug: string; name: string } | null }>();
  if (!article?.sections || article.sections.slug !== section) notFound();

  const title = article.title.length > 140 ? `${article.title.slice(0, 139)}…` : article.title;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#fbfaf7",
          color: "#1b1b1b",
          borderTop: "16px solid #1d5c86",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#1d5c86" }}>
          {article.is_sponsored ? `Sponsored · ${article.sections.name}` : article.sections.name}
        </div>
        <div style={{ display: "flex", fontSize: title.length > 80 ? 56 : 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, borderTop: "2px solid #1b1b1b", paddingTop: 24 }}>{SITE_NAME}</div>
      </div>
    ),
    size,
  );
}
