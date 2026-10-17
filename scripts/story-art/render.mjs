// Hero art for Eye Today stories, drawn in the paper's own type and colour rather than bought as stock.
//
// The brand guide asks for photography of real people, clinics and hearing rooms, and bans the stock
// clichés (pills, syringes, hands reaching for light). Where no photograph exists, an original editorial
// graphic built from the story's own facts beats a generic image: it is accurate, it is ours, and it is not
// pretending to be a photograph. Replace these with real photography when a licensed image is available.
//
// Run: CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/story-art/render.mjs
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = process.env.STORY_ART_OUT ?? path.join(root, ".story-art");

const PAPER = "#faf8f3", INK = "#14201b", BRAND = "#1e5b4a", ACCENT = "#d98e2b", RULE = "#e3ded3", MUTED = "#5b625e";
const POLICY = "#6b4c9a";

async function font(file) {
  const data = await readFile(path.join(root, "node_modules/@fontsource", file));
  return `url(data:font/woff2;base64,${data.toString("base64")}) format("woff2")`;
}

const shell = (f, body, extra = "") => `<html><head><style>
  @font-face { font-family: Fraunces; font-weight: 600; src: ${f.fraunces}; }
  @font-face { font-family: Fraunces; font-weight: 400; font-style: italic; src: ${f.frauncesItalic}; }
  @font-face { font-family: Inter; font-weight: 400; src: ${f.inter}; }
  @font-face { font-family: Inter; font-weight: 700; src: ${f.interBold}; }
  * { margin:0; box-sizing:border-box; }
  body { width:1600px; height:900px; background:${PAPER}; color:${INK}; font-family:Inter, sans-serif; overflow:hidden; }
  .kicker { font-size:19px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; }
  .serif { font-family:Fraunces, Georgia, serif; font-weight:600; }
  ${extra}
</style></head><body>${body}</body></html>`;

// ---------------------------------------------------------------------------
// 1. The coverage, as a dated spine: who ran it and when. Every entry is a piece we opened and checked.
// ---------------------------------------------------------------------------
const COVERAGE = [
  { date: "31 March", outlet: "The Texas Tribune", note: "$50m goes to state-run trials" },
  { date: "20 April", outlet: "Stars and Stripes", note: "Executive order, ex-SEALs at the signing" },
  { date: "27 June", outlet: "ABC13 Houston", note: "The Texans who went to Mexico" },
  { date: "4 October", outlet: "Fox News", note: "$20,000 clinic rooms, and the heart" },
  { date: "6 October", outlet: "Stanford Medicine", note: "One year on &mdash; and what it cannot prove" },
];

const coverage = (f) => shell(f, `
  <div style="width:1600px;height:900px;padding:78px 96px;display:flex;flex-direction:column;gap:46px;border-top:14px solid ${BRAND}">
    <div style="display:flex;align-items:baseline;justify-content:space-between">
      <span class="kicker" style="color:${BRAND}">Ibogaine in the news</span>
      <span class="serif" style="font-size:30px;color:${MUTED}">2026</span>
    </div>
    <div style="display:flex;flex-direction:column">
      ${COVERAGE.map((c, i) => `
        <div style="display:grid;grid-template-columns:230px 1fr;gap:40px;align-items:baseline;padding:22px 0;${i ? `border-top:1px solid ${RULE};` : ""}">
          <span class="serif" style="font-size:34px;color:${ACCENT}">${c.date}</span>
          <div style="display:flex;flex-direction:column;gap:9px">
            <span class="serif" style="font-size:42px;line-height:1">${c.outlet}</span>
            <span style="font-size:23px;color:${MUTED}">${c.note}</span>
          </div>
        </div>`).join("")}
    </div>
    <div style="margin-top:auto;display:flex;align-items:center;gap:16px;border-top:3px solid ${INK};padding-top:20px">
      <span class="kicker" style="color:${INK}">Every one of them reports the cardiac risk</span>
    </div>
  </div>`);

// ---------------------------------------------------------------------------
// 2. The money against the law it does not change.
// ---------------------------------------------------------------------------
const money = (f) => shell(f, `
  <div style="width:1600px;height:900px;padding:78px 96px;display:flex;flex-direction:column;gap:40px;border-top:14px solid ${POLICY}">
    <span class="kicker" style="color:${POLICY}">The money</span>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:56px;flex:1;align-content:center">
      ${[["$50m", "Texas", "SB 2308, state-run trials at UTHealth Houston and UTMB"],
         ["$50m", "Federal", "Executive order, April &mdash; at least this much again"]].map(([n, who, note]) => `
        <div style="display:flex;flex-direction:column;gap:14px;border-left:8px solid ${POLICY};padding-left:30px">
          <span class="serif" style="font-size:132px;line-height:.95">${n}</span>
          <span class="kicker" style="color:${POLICY}">${who}</span>
          <span style="font-size:22px;line-height:1.4;color:${MUTED}">${note}</span>
        </div>`).join("")}
    </div>
    <div style="margin-top:auto;background:${INK};color:${PAPER};padding:34px 40px;display:flex;align-items:center;justify-content:space-between;gap:40px">
      <span class="serif" style="font-size:54px;line-height:1">Still Schedule I</span>
      <span style="font-size:22px;line-height:1.4;text-align:right;max-width:560px">Neither sum reschedules the drug.<br>FDA comments close 20 November 2026.</span>
    </div>
  </div>`);

const f = {
  fraunces: await font("fraunces/files/fraunces-latin-600-normal.woff2"),
  frauncesItalic: await font("fraunces/files/fraunces-latin-400-italic.woff2"),
  inter: await font("inter/files/inter-latin-400-normal.woff2"),
  interBold: await font("inter/files/inter-latin-700-normal.woff2"),
};

await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
for (const [key, html] of [["ibogaine-coverage-2026", coverage(f)], ["ibogaine-fifty-million-schedule-one", money(f)]]) {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(out, `${key}-1600x900.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1600, height: 900 } });
  console.log("wrote", file);
}
await browser.close();
