import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { sectionPaint } from "@/lib/brand/palette";
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
    .select("title, is_sponsored, sections(slug, name, color)")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle<{ title: string; is_sponsored: boolean; sections: { slug: string; name: string; color: string | null } | null }>();
  if (!article?.sections || article.sections.slug !== section) notFound();

  const title = article.title.length > 140 ? `${article.title.slice(0, 139)}…` : article.title;
  const band = sectionPaint(article.sections.slug, article.sections.color);
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
          background: "#FAF8F3",
          color: "#14201B",
          borderTop: `16px solid ${band}`,
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: band }}>
          {article.is_sponsored ? `Sponsored · ${article.sections.name}` : article.sections.name}
        </div>
        <div style={{ display: "flex", fontSize: title.length > 80 ? 56 : 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: "2px solid #14201B", paddingTop: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, border: "3px solid #14201B", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 16, height: 16, borderRadius: 8, background: "#14201B", display: "flex" }} />
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>{SITE_NAME}</div>
        </div>
      </div>
    ),
    size,
  );
}
