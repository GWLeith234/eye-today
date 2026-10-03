import { ImageResponse } from "next/og";

import { BRAND_HEX } from "@/lib/design/brand";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/public/site";

export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The default share card: the iris mark, the name and the tagline, in the brand colours.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, padding: "0 96px", background: BRAND_HEX.paper, color: BRAND_HEX.ink, borderTop: `16px solid ${BRAND_HEX.brand}` }}>
        <svg width="160" height="160" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke={BRAND_HEX.brand} strokeWidth="3" />
          <circle cx="20" cy="20" r="12" fill={BRAND_HEX.brand} />
          <circle cx="20" cy="20" r="8" fill="none" stroke={BRAND_HEX.accent} strokeWidth="2" />
          <circle cx="20" cy="20" r="4.5" fill={BRAND_HEX.ink} />
          <circle cx="24.5" cy="15.5" r="2" fill={BRAND_HEX.paper} />
        </svg>
        <div style={{ display: "flex", fontSize: 120, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", fontSize: 40 }}>{SITE_DESCRIPTION}</div>
      </div>
    ),
    size,
  );
}
