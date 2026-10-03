/** Eye Today brand colours. Every text/background pair the site uses passes WCAG AA. */

export const PAPER = "#FAF8F3";
export const INK = "#14201B";
export const BRAND = "#1E5B4A";
export const AMBER = "#D98E2B";
export const RULE = "#E3DED3";
export const MUTED = "#5B625E";

/**
 * Stories gold. #9A6B12 is 4.41:1 on paper, short of 4.5:1 for small text.
 * #976912 keeps the hue and clears AA.
 */
export const STORIES = "#976912";

export const SECTION_COLORS: Record<string, string> = {
  news: BRAND,
  "research-science": "#2F6FA3",
  "policy-law": "#6B4C9A",
  "treatment-clinics": "#A9472F",
  stories: STORIES,
  opinion: "#3F3F46",
};

export const SECTION_ICONS: Record<string, string> = {
  news: "news",
  "research-science": "research",
  "policy-law": "policy",
  "treatment-clinics": "treatment",
  stories: "stories",
  opinion: "opinion",
};

export const ICON_NAMES = ["news", "research", "policy", "treatment", "stories", "opinion"] as const;

export const HEX = /^#[0-9A-Fa-f]{6}$/;
const SLUG = /^[a-z0-9-]+$/;

function channel(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio. Both arguments are #RRGGBB. */
export function contrastRatio(foreground: string, background: string) {
  const lighter = luminance(foreground);
  const darker = luminance(background);
  const [hi, lo] = lighter > darker ? [lighter, darker] : [darker, lighter];
  return (hi + 0.05) / (lo + 0.05);
}

export function passesAa(foreground: string, background: string, large = false) {
  return contrastRatio(foreground, background) >= (large ? 3 : 4.5);
}

/** Stored hex when it is valid, otherwise the token for that slug. */
export function sectionPaint(slug: string, stored: string | null | undefined) {
  if (stored && HEX.test(stored)) return stored.toUpperCase();
  return SECTION_COLORS[slug] ?? BRAND;
}

/** Small text on paper. A custom colour that fails AA is drawn in ink. */
export function inkOnPaper(color: string) {
  return passesAa(color, PAPER) ? color : INK;
}

/** Foreground for a section band. Paper when it passes, otherwise ink. */
export function onBand(background: string) {
  if (passesAa(PAPER, background)) return PAPER;
  if (passesAa("#FFFFFF", background)) return "#FFFFFF";
  return INK;
}

export function sectionIconName(slug: string, icon: string | null | undefined) {
  if (icon && /^[a-z0-9-]{1,32}$/.test(icon)) return icon;
  return SECTION_ICONS[slug] ?? null;
}

/** CSS variables for section bands and for small text on paper. */
export function sectionStyle(sections: { slug: string; color: string | null }[]) {
  const style: Record<string, string> = {};
  for (const section of sections) {
    if (!SLUG.test(section.slug)) continue;
    const paint = sectionPaint(section.slug, section.color);
    style[`--section-${section.slug}`] = paint;
    style[`--section-${section.slug}-ink`] = inkOnPaper(paint);
  }
  return style;
}

export function sectionInkVar(slug: string) {
  const fallback = inkOnPaper(sectionPaint(slug, null));
  return SLUG.test(slug) ? `var(--section-${slug}-ink, ${fallback})` : fallback;
}

export function sectionBandVar(slug: string) {
  const paint = sectionPaint(slug, null);
  return SLUG.test(slug) ? `var(--section-${slug}, ${paint})` : paint;
}
