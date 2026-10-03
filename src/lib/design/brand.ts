// The brand colours as hex, for places that cannot read CSS variables: share images, app icons.
// src/app/globals.css is the source of truth; tokens.test.ts fails if these drift from it.
export const BRAND_HEX = {
  paper: "#faf8f3",
  ink: "#14201b",
  brand: "#1e5b4a",
  accent: "#d98e2b",
} as const;
