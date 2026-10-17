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
  { key: "billboard", w: 970, h: 250 },
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

// The skin: 1920×1400, the centre column (PAGE_COLUMN_PX) left plain for the page, the message repeated in each
// gutter where a reader at 1440 or 1920 sees it. Rendered at 1× as a JPEG: it is a background, not a unit.
const SKIN = { key: "skin", w: 1920, h: 1400, column: 1180 };

function skinHtml(a) {
  const gutter = (SKIN.w - SKIN.column) / 2;
  // Two tiers per gutter: a narrow strip against the page column that every desktop reader sees (at 1440 the
  // visible gutter is 130 px), and the full message beyond it for readers on wider screens.
  const panel = `
    <div class="panel">
      <div class="band"></div>
      <div class="edge"><span class="vertical">${a.mark.text} ${a.mark.sub} · ${a.cta} →</span></div>
      <div class="inner">
        <div class="kicker">${a.kicker}</div>
        <div class="wordmark"><span class="word">${a.mark.text}</span><span class="sub">${a.mark.sub}</span></div>
        <div class="line">${a.line}</div>
        <span class="cta">${a.cta} →</span>
      </div>
    </div>`;
  return `<html><head><style>
    * { margin:0; box-sizing:border-box; }
    body { width:${SKIN.w}px; height:${SKIN.h}px; overflow:hidden; background:${a.bg}; color:${a.ink}; font-family: Inter, "Helvetica Neue", Arial, sans-serif; display:flex; justify-content:space-between; }
    .panel { width:${gutter}px; height:${SKIN.h}px; position:relative; display:flex; }
    .band { position:absolute; top:0; bottom:0; width:12px; background:${a.accent}; }
    .panel:first-child .band { left:0; } .panel:last-child .band { right:0; }
    /* The message hugs the page column: at 1440 the reader sees the inner 130 px of each gutter, at 1920 all of it. */
    .edge { position:absolute; top:0; bottom:0; width:110px; display:flex; align-items:flex-start; justify-content:center; padding-top:${Math.round(SKIN.h * 0.12)}px; }
    .panel:first-child .edge { right:0; } .panel:last-child .edge { left:0; }
    .vertical { writing-mode:vertical-rl; transform:rotate(180deg); font-weight:900; letter-spacing:.16em; font-size:22px; text-transform:uppercase; color:${a.accent}; white-space:nowrap; border-left:0; }
    .panel:last-child .vertical { transform:none; }
    .inner { display:flex; flex-direction:column; gap:22px; width:${gutter - 110 - 48}px; margin-top:${Math.round(SKIN.h * 0.3)}px; }
    .panel:first-child .inner { margin-left:24px; margin-right:auto; }
    .panel:last-child .inner { margin-left:auto; margin-right:24px; align-items:flex-end; text-align:right; }
    .panel:last-child .cta { align-self:flex-end; }
    .kicker { font-size:14px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:${a.accent}; }
    .wordmark { display:flex; flex-direction:column; line-height:1; }
    .word { font-weight:900; letter-spacing:0.08em; font-size:44px; line-height:1.05; }
    .sub { font-size:16px; opacity:.85; margin-top:8px; }
    .line { font-size:20px; line-height:1.3; opacity:.95; }
    .cta { display:inline-block; background:${a.accent}; color:${a.bg}; font-weight:800; font-size:15px; padding:12px 18px; align-self:flex-start; }
  </style></head><body>${panel}${panel}</body></html>`;
}

function html(a, s) {
  const wide = s.h <= 90;
  const tall = s.h >= 600;
  const tiny = s.w <= 320 && s.h <= 50;
  const billboard = s.w >= 970;
  const markHtml = a.mark.image
    ? `<img class="mark" src="${a.mark.image}" alt="${a.mark.alt}">`
    : `<div class="wordmark"><span class="word">${a.mark.text}</span>${!tiny ? `<span class="sub">${a.mark.sub}</span>` : ""}</div>`;
  return `<html><head><style>
    * { margin:0; box-sizing:border-box; }
    body { width:${s.w}px; height:${s.h}px; overflow:hidden; background:${a.bg}; color:${a.ink}; font-family: Inter, "Helvetica Neue", Arial, sans-serif; }
    .ad { width:${s.w}px; height:${s.h}px; display:flex; ${wide || tiny || billboard ? "flex-direction:row; align-items:center;" : tall ? "flex-direction:column; justify-content:flex-start;" : "flex-direction:column; justify-content:space-between;"} padding:${tiny ? "6px 10px" : wide ? "10px 16px" : billboard ? "0 48px" : tall ? "28px 24px" : "18px 20px"}; gap:${tiny ? 10 : wide ? 18 : billboard ? 48 : tall ? 26 : 14}px; ${billboard ? `border-left: 12px solid ${a.accent};` : `border-top: 4px solid ${a.accent};`} }
    .mark { height:${tiny ? 30 : wide ? 54 : billboard ? 110 : tall ? 60 : 50}px; width:auto; max-width:${tiny ? 150 : wide ? 240 : billboard ? 320 : 252}px; object-fit:contain; ${a.mark.image && a.bg !== "#ffffff" ? "filter: brightness(0) invert(1);" : ""} }
    .wordmark { display:flex; flex-direction:column; line-height:1; }
    .word { font-weight:900; letter-spacing:0.1em; font-size:${tiny ? 16 : wide ? 24 : billboard ? 48 : tall ? 30 : 24}px; line-height:1.05; ${wide || tiny || billboard ? "white-space:nowrap;" : "max-width:252px;"} }
    .sub { font-size:${wide ? 11 : billboard ? 18 : 12}px; opacity:.8; margin-top:${billboard ? 8 : 4}px; }
    .text { display:flex; flex-direction:column; gap:${wide ? 2 : billboard ? 12 : 10}px; min-width:0; ${wide || billboard ? "flex:1;" : ""} }
    .kicker { font-size:${tiny ? 9 : billboard ? 14 : 11}px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:${a.accent}; }
    .line { font-size:${tiny ? 11 : wide ? 15 : billboard ? 26 : tall ? 22 : 17}px; line-height:1.25; ${wide || tiny ? "white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" : ""} }
    .cta { display:inline-block; ${tall ? "margin-top:auto;" : ""} background:${a.accent}; color:${a.bg}; font-weight:800; font-size:${tiny ? 10 : billboard ? 18 : 13}px; padding:${tiny ? "4px 8px" : wide ? "8px 12px" : billboard ? "16px 24px" : "10px 14px"}; white-space:nowrap; ${wide || tiny || billboard ? "margin-left:auto;" : "align-self:flex-start;"} }
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
// Shadow Warriors Project is the launch takeover; the skin is rendered for them only.
const takeover = ADVERTISERS.find((a) => a.slug === "shadow-warriors");
if (takeover) {
  await page.setViewportSize({ width: SKIN.w, height: SKIN.h });
  const skinPage = await browser.newPage({ viewport: { width: SKIN.w, height: SKIN.h }, deviceScaleFactor: 1 });
  await skinPage.setContent(skinHtml(takeover), { waitUntil: "load" });
  const file = path.join(out, `${takeover.slug}-skin-${SKIN.w}x${SKIN.h}.jpg`);
  await skinPage.screenshot({ path: file, type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: SKIN.w, height: SKIN.h } });
  console.log("wrote", path.relative(root, file));
  await skinPage.close();
}
await browser.close();
