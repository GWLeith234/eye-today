// Renders the Eye Today house creatives at every IAB unit size, with the brand fonts, to public/house-ads/.
// Run: node scripts/house-ads/render.mjs   (needs Playwright's Chromium, as CI has)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "public/house-ads");

const PAPER = "#faf8f3", INK = "#14201b", BRAND = "#1e5b4a", ACCENT = "#d98e2b";

async function font(file) {
  const data = await readFile(path.join(root, "node_modules/@fontsource", file));
  return `url(data:font/woff2;base64,${data.toString("base64")}) format("woff2")`;
}

// One message per unit. Short enough to read at a glance; the same four house lines the site already sells.
const CREATIVES = [
  { key: "leaderboard", w: 728, h: 90, kicker: "The monthly edition", line: "Every story that mattered, in one issue.", cta: "Read Issue No. 1", url: "/editions" },
  { key: "in-river", w: 728, h: 90, kicker: "Advertise with Eye Today", line: "Reach the people who decide on treatment.", cta: "Rate card", url: "/advertise" },
  { key: "mobile-banner", w: 320, h: 50, kicker: "Eye Today", line: "Get the newsletter.", cta: "Subscribe", url: "/newsletter" },
  { key: "bigbox-1", w: 300, h: 250, kicker: "The directory", line: "Verified ibogaine and addiction-treatment providers. A listing is free.", cta: "List your clinic", url: "/directory/submit" },
  { key: "bigbox-2", w: 300, h: 250, kicker: "Independent reporting", line: "Free to read, free of provider influence. Supporters make it possible.", cta: "Become a supporter", url: "/support" },
  { key: "in-article", w: 300, h: 250, kicker: "Don’t miss the next story", line: "News, research and policy on ibogaine, in your inbox.", cta: "Subscribe", url: "/newsletter" },
  { key: "half-page", w: 300, h: 600, kicker: "Trials & Funding Tracker", line: "Every ibogaine trial, grant and ruling, in one place — kept current by the newsroom.", cta: "Open the tracker", url: "/tracker" },
];

function layout(c) {
  const wide = c.h <= 90;
  const tall = c.h >= 600;
  const kickerSize = wide ? (c.w < 400 ? 11 : 13) : 13;
  const lineSize = wide ? (c.w < 400 ? 15 : 22) : tall ? 30 : 24;
  const ctaSize = wide ? 13 : 14;
  return `
  <html><head><style>
    @font-face { font-family: Fraunces; font-weight: 700; src: ${c.fonts.fraunces}; }
    @font-face { font-family: Fraunces; font-weight: 400; font-style: italic; src: ${c.fonts.frauncesItalic}; }
    @font-face { font-family: Inter; font-weight: 400; src: ${c.fonts.inter}; }
    @font-face { font-family: Inter; font-weight: 700; src: ${c.fonts.interBold}; }
    * { margin: 0; box-sizing: border-box; }
    body { width: ${c.w}px; height: ${c.h}px; overflow: hidden; background: ${PAPER}; color: ${INK}; font-family: Inter, sans-serif; }
    .ad { position: relative; width: ${c.w}px; height: ${c.h}px; border: 1px solid ${INK}; display: flex; ${wide ? "flex-direction: row; align-items: center;" : tall ? "flex-direction: column; justify-content: flex-start;" : "flex-direction: column; justify-content: space-between;"} padding: ${wide ? "0 14px" : tall ? "28px 24px" : "18px 20px"}; gap: ${wide ? "16px" : tall ? "22px" : "12px"}; }
    .ad::before { content: ""; position: absolute; left: 0; top: 0; ${wide ? `width: 6px; height: 100%;` : `width: 100%; height: 6px;`} background: ${BRAND}; }
    .mark { display: flex; align-items: center; gap: 8px; font-family: Fraunces, serif; font-weight: 700; font-size: ${wide ? 18 : tall ? 26 : 20}px; letter-spacing: -0.01em; white-space: nowrap; }
    .eye { width: ${wide ? 18 : 22}px; height: ${wide ? 18 : 22}px; border-radius: 50%; border: 2px solid ${INK}; position: relative; }
    .eye::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: ${INK}; }
    .kicker { font-size: ${kickerSize}px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND}; }
    .line { font-family: Fraunces, serif; font-weight: 400; font-style: italic; font-size: ${lineSize}px; line-height: 1.15; ${wide ? "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" : ""} }
    .cta { display: inline-block; background: ${ACCENT}; color: ${INK}; font-weight: 700; font-size: ${ctaSize}px; padding: ${wide ? "7px 12px" : "10px 14px"}; white-space: nowrap; ${wide ? "margin-left: auto;" : "align-self: flex-start;"} }
    .text { display: flex; flex-direction: column; gap: ${wide ? 2 : 10}px; min-width: 0; ${wide ? "flex: 1;" : ""} }
    .foot { font-size: 11px; color: #5b665f; margin-top: auto; }
  </style></head><body>
  <div class="ad">
    ${wide ? `<div class="mark"><span class="eye"></span>${c.w < 400 ? "" : "Eye Today"}</div>` : `<div class="mark"><span class="eye"></span>Eye Today</div>`}
    <div class="text"><div class="kicker">${c.kicker}</div><div class="line">${c.line}</div></div>
    ${tall ? `<div class="foot">theeye.today</div>` : ""}
    <span class="cta">${c.cta} →</span>
  </div></body></html>`;
}

const fonts = {
  fraunces: await font("fraunces/files/fraunces-latin-700-normal.woff2"),
  frauncesItalic: await font("fraunces/files/fraunces-latin-400-italic.woff2"),
  inter: await font("inter/files/inter-latin-400-normal.woff2"),
  interBold: await font("inter/files/inter-latin-700-normal.woff2"),
};

await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2 });
for (const c of CREATIVES) {
  await page.setViewportSize({ width: c.w, height: c.h });
  await page.setContent(layout({ ...c, fonts }), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(out, `${c.key}-${c.w}x${c.h}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: c.w, height: c.h }, omitBackground: false });
  console.log("wrote", path.relative(root, file));
}
await browser.close();
await writeFile(path.join(out, "README.md"), `# House creatives\n\nRendered by \`node scripts/house-ads/render.mjs\` at 2× for each IAB unit. Served as the fallback when no paid creative fits a unit (migration 0027).\n`);
