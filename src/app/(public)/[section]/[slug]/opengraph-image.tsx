import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { BRAND_HEX } from "@/lib/design/brand";
import { isHexColor } from "@/lib/design/contrast";
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
    .maybeSingle<{ title: string; is_sponsored: boolean; sections: { slug: string; name: string; color?: string | null } | null }>();
  if (!article?.sections || article.sections.slug !== section) notFound();

  const accent = isHexColor(article.sections.color) ? article.sections.color : BRAND_HEX.brand;
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
          background: BRAND_HEX.paper,
          color: BRAND_HEX.ink,
          borderTop: `16px solid ${accent}`,
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: accent }}>
          {article.is_sponsored ? `Sponsored · ${article.sections.name}` : article.sections.name}
        </div>
        <div style={{ display: "flex", fontSize: title.length > 80 ? 56 : 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700, borderTop: `2px solid ${BRAND_HEX.ink}`, paddingTop: 24 }}>
          <svg width="56" height="56" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke={BRAND_HEX.brand} strokeWidth="3" />
            <circle cx="20" cy="20" r="12" fill={BRAND_HEX.brand} />
            <circle cx="20" cy="20" r="8" fill="none" stroke={BRAND_HEX.accent} strokeWidth="2" />
            <circle cx="20" cy="20" r="4.5" fill={BRAND_HEX.ink} />
            <circle cx="24.5" cy="15.5" r="2" fill={BRAND_HEX.paper} />
          </svg>
          {SITE_NAME}
        </div>
      </div>
    ),
    size,
  );
}
