// Renders display creatives for advertisers who have a wordmark but no ad artwork, at the IAB sizes Eye Today
// sells. The wordmark is loaded from the advertiser's own site at render time; the output is committed under
// public/advertiser-ads/ and served like any other image creative.
// Run: CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/advertiser-ads/render.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "public/advertiser-ads");

const SIZES = [
  { key: "leaderboard", w: 728, h: 90 },
  { key: "bigbox", w: 300, h: 250 },
  { key: "half-page", w: 300, h: 600 },
  { key: "mobile", w: 320, h: 50 },
];

// Each advertiser: a wordmark (image URL or text), background, ink, a line, a CTA.
const ADVERTISERS = [
  {
    slug: "shadow-warriors",
    // Their wordmark (shadowwarriorsproject.org/wp-content/uploads/2023/04/swp_letter_01-1024x228.png) is not reachable
    // from the render environment, so the name is set in type until the real artwork is dropped in.
    mark: { text: "SHADOW WARRIORS", sub: "PROJECT" },
    bg: "#0f172a", ink: "#f8fafc", accent: "#c8a24a",
    kicker: "Help a warrior",
    line: "For the contractors who served in the shadows.",
    cta: "Stand with them",
  },
  {
    slug: "ozcast",
    mark: { text: "OZCAST", sub: "with Mark “Oz” Geist" },
    bg: "#111111", ink: "#ffffff", accent: "#e63946",
    kicker: "Coming soon",
    line: "Spotify · YouTube · Apple Podcasts",
    cta: "Be first to listen",
  },
];

function html(a, s) {
  const wide = s.h <= 90;
  const tall = s.h >= 600;
  const tiny = s.w <= 320 && s.h <= 50;
  const markHtml = a.mark.image
    ? `<img class="mark" src="${a.mark.image}" alt="${a.mark.alt}">`
    : `<div class="wordmark"><span class="word">${a.mark.text}</span>${!tiny ? `<span class="sub">${a.mark.sub}</span>` : ""}</div>`;
  return `<html><head><style>
    * { margin:0; box-sizing:border-box; }
    body { width:${s.w}px; height:${s.h}px; overflow:hidden; background:${a.bg}; color:${a.ink}; font-family: Inter, "Helvetica Neue", Arial, sans-serif; }
    .ad { width:${s.w}px; height:${s.h}px; display:flex; ${wide || tiny ? "flex-direction:row; align-items:center;" : tall ? "flex-direction:column; justify-content:flex-start;" : "flex-direction:column; justify-content:space-between;"} padding:${tiny ? "6px 10px" : wide ? "10px 16px" : tall ? "28px 24px" : "18px 20px"}; gap:${tiny ? 10 : wide ? 18 : tall ? 26 : 14}px; border-top: 4px solid ${a.accent}; }
    .mark { height:${tiny ? 30 : wide ? 54 : tall ? 60 : 50}px; width:auto; max-width:${tiny ? 150 : wide ? 240 : 252}px; object-fit:contain; ${a.mark.image && a.bg !== "#ffffff" ? "filter: brightness(0) invert(1);" : ""} }
    .wordmark { display:flex; flex-direction:column; line-height:1; }
    .word { font-weight:900; letter-spacing:0.1em; font-size:${tiny ? 16 : wide ? 24 : tall ? 30 : 24}px; line-height:1.05; ${wide || tiny ? "white-space:nowrap;" : "max-width:252px;"} }
    .sub { font-size:${wide ? 11 : 12}px; opacity:.8; margin-top:4px; }
    .text { display:flex; flex-direction:column; gap:${wide ? 2 : 10}px; min-width:0; ${wide ? "flex:1;" : ""} }
    .kicker { font-size:${tiny ? 9 : 11}px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:${a.accent}; }
    .line { font-size:${tiny ? 11 : wide ? 15 : tall ? 22 : 17}px; line-height:1.25; ${wide || tiny ? "white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" : ""} }
    .cta { display:inline-block; ${tall ? "margin-top:auto;" : ""} background:${a.accent}; color:${a.bg}; font-weight:800; font-size:${tiny ? 10 : 13}px; padding:${tiny ? "4px 8px" : wide ? "8px 12px" : "10px 14px"}; white-space:nowrap; ${wide || tiny ? "margin-left:auto;" : "align-self:flex-start;"} }
  </style></head><body><div class="ad">
    ${markHtml}
    ${tiny ? "" : `<div class="text"><div class="kicker">${a.kicker}</div><div class="line">${a.line}</div></div>`}
    <span class="cta">${a.cta} →</span>
  </div></body></html>`;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 2 });
for (const a of ADVERTISERS) {
  for (const s of SIZES) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.setContent(html(a, s), { waitUntil: "networkidle" });
    await page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })))));
    const file = path.join(out, `${a.slug}-${s.key}-${s.w}x${s.h}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: s.w, height: s.h } });
    console.log("wrote", path.relative(root, file));
  }
}
await browser.close();
