// OZCast — brand assets and Eye Today display creatives for the 11 November launch.
//
// There is no OZCast brand to copy: markgeist.com is a funnel page for the book with no mention of the show,
// so this builds one from Mark "Oz" Geist's own material (Benghazi, 13 Hours, Shadow Warriors Project, his
// line "stories that matter"). The mark is a signal O — a ring with a centre dot, the transmission waves
// opening to the right on the badge — set in Archivo Black over night blue with an ember signal accent, so it
// sits beside Shadow Warriors' navy-and-gold without copying it.
//
// Run: CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/ozcast-brand/render.mjs
//
// Ad units go to public/advertiser-ads/ (served by Eye Today); the brand assets (wordmark, badge, cover art,
// announce card) go to the directory in OZCAST_BRAND_OUT, for Mark's own use — they are not Eye Today's.
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const adsOut = path.join(root, "public/advertiser-ads");
const brandOut = process.env.OZCAST_BRAND_OUT ?? path.join(root, ".ozcast-brand");

// The palette. Signal on Night is 5.2:1 and Bone on Night 16:1, so every pairing below clears AA.
const NIGHT = "#0B1016";
const BONE = "#F2EDE4";
const SIGNAL = "#E8542F";
const STEEL = "#8A96A0";

const HOST = "Mark &ldquo;Oz&rdquo; Geist";
const TAGLINE = "Stories from the shadows.";
const LAUNCH = "First episode 11 November";

async function font(file) {
  const data = await readFile(path.join(root, "node_modules/@fontsource", file));
  return `url(data:font/woff2;base64,${data.toString("base64")}) format("woff2")`;
}

// The signal O: a ring with a solid centre, and on the badge two waves opening right. Drawn rather than set
// so it holds its weight at 320×50 and at 3000×3000.
function signalO({ size, waves = false, ink = BONE, dot = SIGNAL }) {
  // The viewBox hugs the ring (outer radius 37.5) so the glyph sits on the cap line with no dead space: as the
  // O of the wordmark it has to measure like a letter, not like an icon parked beside one.
  // Both waves are concentric with the ring (outer radius 37.5) and span ±35°, so they clear it on the right
  // and stay inside the glyph's own height instead of being clipped.
  const right = waves ? 23 : 0;
  return `<svg width="${size * (75 + right) / 75}" height="${size}" viewBox="12.5 12.5 ${75 + right} 75" fill="none" aria-hidden="true" style="display:block">
    <circle cx="50" cy="50" r="31" stroke="${ink}" stroke-width="13"/>
    <circle cx="50" cy="50" r="10.5" fill="${dot}"/>
    ${waves ? `<path d="M 94.15 26.53 A 50 50 0 0 1 94.15 73.47" stroke="${dot}" stroke-width="10" stroke-linecap="round"/>
      <path d="M 106.5 19.95 A 64 64 0 0 1 106.5 80.05" stroke="${dot}" stroke-width="8" stroke-linecap="round"/>` : ""}
  </svg>`;
}

// OZCAST set in Archivo Black with the signal O in place of the letter.
function wordmark({ size, ink = BONE, dot = SIGNAL }) {
  // The O is drawn at cap height and set tight against the Z, so the wordmark reads OZCAST, not icon + ZCAST.
  return `<span style="display:inline-flex;align-items:center;gap:${size * 0.045}px;font-family:Archivo;font-weight:900;font-size:${size}px;letter-spacing:-0.02em;line-height:1;color:${ink};white-space:nowrap">
    ${signalO({ size: size * 0.735, ink, dot })}<span>ZCAST</span>
  </span>`;
}

const shell = (fonts, w, h, body, extra = "") => `<html><head><style>
  @font-face { font-family: Archivo; font-weight: 900; src: ${fonts.archivo900}; }
  @font-face { font-family: Archivo; font-weight: 700; src: ${fonts.archivo700}; }
  @font-face { font-family: Inter; font-weight: 400; src: ${fonts.inter}; }
  @font-face { font-family: Inter; font-weight: 700; src: ${fonts.interBold}; }
  * { margin: 0; box-sizing: border-box; }
  body { width:${w}px; height:${h}px; overflow:hidden; background:${NIGHT}; color:${BONE}; font-family: Inter, sans-serif; }
  .kicker { font-family: Inter; font-weight:700; text-transform:uppercase; letter-spacing:.2em; color:${SIGNAL}; }
  .host { color:${STEEL}; }
  .cta { display:inline-block; background:${SIGNAL}; color:${NIGHT}; font-family:Inter; font-weight:700; white-space:nowrap; }
  .rule { background:${SIGNAL}; }
  ${extra}
</style></head><body>${body}</body></html>`;

// ---------------------------------------------------------------------------
// Eye Today display units. Every one is an IAB size; the billboard is the takeover unit (Sprint 24).
// ---------------------------------------------------------------------------
const UNITS = [
  { key: "billboard", w: 970, h: 250 },
  { key: "leaderboard", w: 728, h: 90 },
  { key: "bigbox", w: 300, h: 250 },
  { key: "half-page", w: 300, h: 600 },
  { key: "mobile", w: 320, h: 50 },
];

function unitHtml(fonts, s) {
  const wide = s.h <= 90;
  const tiny = s.w <= 320 && s.h <= 50;
  const tall = s.h >= 600;
  const big = s.w >= 970;

  if (tiny) {
    return shell(fonts, s.w, s.h, `<div style="width:${s.w}px;height:${s.h}px;display:flex;align-items:center;gap:10px;padding:0 10px;border-left:5px solid ${SIGNAL}">
      ${wordmark({ size: 19 })}
      <span style="font-size:11px;color:${STEEL};white-space:nowrap">11 Nov</span>
      <span class="cta" style="margin-left:auto;font-size:10px;padding:5px 9px">Follow →</span>
    </div>`);
  }
  if (wide) {
    return shell(fonts, s.w, s.h, `<div style="width:${s.w}px;height:${s.h}px;display:flex;align-items:center;gap:20px;padding:0 18px;border-left:7px solid ${SIGNAL}">
      ${wordmark({ size: 30 })}
      <div style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1">
        <span class="kicker" style="font-size:10px">${LAUNCH}</span>
        <span style="font-family:Archivo;font-weight:700;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${TAGLINE}</span>
      </div>
      <span class="cta" style="font-size:13px;padding:9px 14px">Follow the show →</span>
    </div>`);
  }
  if (big) {
    return shell(fonts, s.w, s.h, `<div style="width:${s.w}px;height:${s.h}px;display:flex;align-items:center;gap:44px;padding:0 50px;border-left:12px solid ${SIGNAL}">
      <div style="display:flex;flex-direction:column;gap:14px">
        ${signalO({ size: 86, waves: true })}
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;flex:1;min-width:0">
        ${wordmark({ size: 52 })}
        <span style="font-family:Archivo;font-weight:700;font-size:30px;line-height:1.1">${TAGLINE}</span>
        <span style="font-size:15px" class="host">${HOST} &middot; ${LAUNCH}</span>
      </div>
      <span class="cta" style="font-size:18px;padding:16px 24px">Follow the show →</span>
    </div>`);
  }
  // 300×250 and 300×600
  return shell(fonts, s.w, s.h, `<div style="width:${s.w}px;height:${s.h}px;display:flex;flex-direction:column;gap:${tall ? 26 : 14}px;padding:${tall ? "34px 26px" : "22px 20px"};border-top:${tall ? 10 : 7}px solid ${SIGNAL}">
    ${tall ? signalO({ size: 92, waves: true }) : ""}
    ${wordmark({ size: tall ? 40 : 30 })}
    <span style="font-family:Archivo;font-weight:700;font-size:${tall ? 30 : 21}px;line-height:1.15">${TAGLINE}</span>
    ${tall ? `<span style="font-size:15px;line-height:1.45" class="host">${HOST} talks with the people who were there &mdash; the contractors, medics and families who served where nobody was watching.</span>` : ""}
    <span class="kicker" style="font-size:${tall ? 12 : 10}px;margin-top:auto">${LAUNCH}</span>
    <span class="cta" style="font-size:${tall ? 15 : 13}px;padding:${tall ? "13px 18px" : "10px 14px"};align-self:flex-start">Follow the show →</span>
  </div>`);
}

// ---------------------------------------------------------------------------
// Brand assets for Mark's own use.
// ---------------------------------------------------------------------------
const BRAND = [
  {
    key: "ozcast-cover-3000x3000", w: 3000, h: 3000, // podcast cover art (Apple/Spotify want ≥ 1400, 3000 is the max)
    body: () => `<div style="width:3000px;height:3000px;display:flex;flex-direction:column;justify-content:center;gap:150px;padding:260px;border-left:90px solid ${SIGNAL}">
      ${signalO({ size: 720, waves: true })}
      <div style="display:flex;flex-direction:column;gap:70px">
        ${wordmark({ size: 420 })}
        <span style="font-family:Archivo;font-weight:700;font-size:150px;line-height:1.1">${TAGLINE}</span>
        <span style="font-size:96px" class="host">with ${HOST}</span>
      </div>
    </div>`,
  },
  {
    key: "ozcast-wordmark-on-night-1600x400", w: 1600, h: 400,
    body: () => `<div style="width:1600px;height:400px;display:flex;align-items:center;justify-content:center">${wordmark({ size: 190 })}</div>`,
  },
  {
    key: "ozcast-wordmark-on-bone-1600x400", w: 1600, h: 400, bg: BONE,
    body: () => `<div style="width:1600px;height:400px;display:flex;align-items:center;justify-content:center;background:${BONE}">${wordmark({ size: 190, ink: NIGHT })}</div>`,
  },
  {
    key: "ozcast-badge-800x800", w: 800, h: 800,
    body: () => `<div style="width:800px;height:800px;display:flex;align-items:center;justify-content:center">${signalO({ size: 460, waves: true })}</div>`,
  },
  {
    key: "ozcast-announce-1080x1080", w: 1080, h: 1080, // the launch card for social
    body: () => `<div style="width:1080px;height:1080px;display:flex;flex-direction:column;justify-content:space-between;padding:86px;border-left:26px solid ${SIGNAL}">
      ${wordmark({ size: 128 })}
      <div style="display:flex;flex-direction:column;gap:26px">
        <span style="font-family:Archivo;font-weight:900;font-size:96px;line-height:1.05">${TAGLINE}</span>
        <span style="font-size:36px;line-height:1.45" class="host">${HOST} talks with the people who served where nobody was watching.</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;flex-direction:column;gap:10px">
          <span class="kicker" style="font-size:26px">First episode</span>
          <span style="font-family:Archivo;font-weight:900;font-size:86px;line-height:1">11 NOVEMBER</span>
        </div>
        ${signalO({ size: 150, waves: true })}
      </div>
    </div>`,
  },
];

const fonts = {
  archivo900: await font("archivo/files/archivo-latin-900-normal.woff2"),
  archivo700: await font("archivo/files/archivo-latin-700-normal.woff2"),
  inter: await font("inter/files/inter-latin-400-normal.woff2"),
  interBold: await font("inter/files/inter-latin-700-normal.woff2"),
};

await mkdir(adsOut, { recursive: true });
await mkdir(brandOut, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2 });
for (const s of UNITS) {
  await page.setViewportSize({ width: s.w, height: s.h });
  await page.setContent(unitHtml(fonts, s), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(adsOut, `ozcast-${s.key}-${s.w}x${s.h}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: s.w, height: s.h } });
  console.log("wrote", path.relative(root, file));
}
await page.close();

const big = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
for (const b of BRAND) {
  await big.setViewportSize({ width: b.w, height: b.h });
  await big.setContent(shell(fonts, b.w, b.h, b.body(), b.bg ? `body { background:${b.bg}; }` : ""), { waitUntil: "load" });
  await big.evaluate(() => document.fonts.ready);
  const file = path.join(brandOut, `${b.key}.png`);
  await big.screenshot({ path: file, clip: { x: 0, y: 0, width: b.w, height: b.h } });
  console.log("wrote", path.relative(root, file));
}
await browser.close();
