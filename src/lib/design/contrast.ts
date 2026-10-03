// WCAG 2.x contrast. Pure, so the token test, the admin form and the page code share one definition.

const HEX = /^#([0-9a-f]{6})$/i;

export const isHexColor = (value: unknown): value is string => typeof value === "string" && HEX.test(value);

function channel(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const match = HEX.exec(hex);
  if (!match) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_TEXT = 4.5;

// A section colour is used as text on paper and as a band behind paper-coloured text, so it must clear AA both ways.
export function sectionColorProblem(color: string, paper: string): string | null {
  if (!isHexColor(color)) return "Use a colour like #1E5B4A.";
  const ratio = contrastRatio(color, paper);
  return ratio >= AA_TEXT ? null : `That colour is too light to read on the page (${ratio.toFixed(1)}:1; it needs ${AA_TEXT}:1).`;
}
