import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { contrastRatio, isHexColor, sectionColorProblem } from "./contrast";

// Reads the real stylesheet, so a token edit that breaks contrast fails here, not in review.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const tokens = Object.fromEntries([...theme.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));

const SECTIONS = ["news", "research-science", "policy-law", "treatment-clinics", "stories", "opinion"] as const;
const AA = 4.5;

const must = (name: string) => {
  const value = tokens[name];
  assert.ok(value, `--color-${name} is missing from @theme`);
  return value;
};

test("the brief's brand tokens are all defined", () => {
  assert.equal(must("paper").toLowerCase(), "#faf8f3");
  assert.equal(must("ink").toLowerCase(), "#14201b");
  assert.equal(must("brand").toLowerCase(), "#1e5b4a");
  assert.equal(must("accent").toLowerCase(), "#d98e2b");
  assert.equal(must("rule").toLowerCase(), "#e3ded3");
  assert.equal(must("muted").toLowerCase(), "#5b625e");
  for (const slug of SECTIONS) assert.ok(isHexColor(tokens[`sec-${slug}`]), `section colour for ${slug}`);
});

// Every pair the components use: [text, background, what it is].
const PAIRS: [string, string, string][] = [
  ["ink", "paper", "body text"],
  ["muted", "paper", "secondary text"],
  ["brand", "paper", "links and kickers"],
  ["paper", "brand", "text on brand fills"],
  ["paper", "ink", "text on ink fills (footer, badges)"],
  ["ink", "accent", "Support button"],
  ["accent", "ink", "amber on the dark footer"],
  ...SECTIONS.flatMap((slug): [string, string, string][] => [
    [`sec-${slug}`, "paper", `${slug} kicker and link text`],
    ["paper", `sec-${slug}`, `${slug} header band`],
  ]),
];

for (const [text, background, what] of PAIRS) {
  test(`contrast: ${text} on ${background} (${what}) meets WCAG AA`, () => {
    const ratio = contrastRatio(must(text), must(background));
    assert.ok(ratio >= AA, `${text} on ${background} is ${ratio.toFixed(2)}:1, below ${AA}:1`);
  });
}

test("white and ink on the rule colour are not used for text; muted on white also passes", () => {
  assert.ok(contrastRatio(must("muted"), "#ffffff") >= AA);
});

test("the contrast function matches known values", () => {
  assert.equal(contrastRatio("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(contrastRatio("#777777", "#ffffff").toFixed(2), "4.48");
  assert.throws(() => contrastRatio("red", "#fff"));
});

test("sectionColorProblem refuses colours that cannot be read on paper", () => {
  const paper = must("paper");
  assert.equal(sectionColorProblem("#1E5B4A", paper), null);
  assert.match(sectionColorProblem("#D98E2B", paper) ?? "", /too light/);
  assert.match(sectionColorProblem("green", paper) ?? "", /#1E5B4A/);
});

test("the old placeholder palette is gone from source", () => {
  const old = ["#fbfaf7", "#1b1b1b", "#1d5c86", "#dcd8cf", "#5c5c5c"];
  const files = ["src/app/globals.css", "src/lib/newsletter/templates/colors.ts", "src/app/(public)/[section]/[slug]/opengraph-image.tsx"];
  for (const file of files) {
    const text = readFileSync(join(process.cwd(), file), "utf8").toLowerCase();
    for (const hex of old) assert.ok(!text.includes(hex), `${file} still has ${hex}`);
  }
});

test("the hex constants used by share images and icons match the stylesheet", async () => {
  const { BRAND_HEX } = await import("./brand");
  for (const key of ["paper", "ink", "brand", "accent"] as const) assert.equal(BRAND_HEX[key], must(key).toLowerCase());
});
