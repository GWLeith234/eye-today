import type { CSSProperties } from "react";

import { isHexColor } from "./contrast";

// The six sections the brief names have a token; any other section without a stored colour uses the brand green.
const TOKENED = new Set(["news", "research-science", "policy-law", "treatment-clinics", "stories", "opinion"]);

// Components set this on a wrapper and read it with .sec-text / .sec-bg / .sec-rule (globals.css).
// A stored colour is only used when it is a plain #rrggbb, so nothing else can reach a style attribute.
export function sectionStyle(slug: string, color?: string | null): CSSProperties {
  const value = isHexColor(color) ? color : TOKENED.has(slug) ? `var(--color-sec-${slug})` : "var(--color-brand)";
  return { "--sec": value } as CSSProperties;
}
