import { ImageResponse } from "next/og";

import { BRAND_HEX } from "@/lib/design/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The iris mark on paper, drawn with the brand hex values (share images cannot read CSS variables).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_HEX.paper }}>
        <svg width="140" height="140" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke={BRAND_HEX.brand} strokeWidth="3" />
          <circle cx="20" cy="20" r="12" fill={BRAND_HEX.brand} />
          <circle cx="20" cy="20" r="8" fill="none" stroke={BRAND_HEX.accent} strokeWidth="2" />
          <circle cx="20" cy="20" r="4.5" fill={BRAND_HEX.ink} />
          <circle cx="24.5" cy="15.5" r="2" fill={BRAND_HEX.paper} />
        </svg>
      </div>
    ),
    size,
  );
}
