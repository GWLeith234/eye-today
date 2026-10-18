// The installed-app icons: the iris mark on the brand green, at the sizes a home screen asks for.
//
// Same geometry as src/components/public/wordmark.tsx and src/app/apple-icon.tsx, so the phone icon, the
// Safari icon and the masthead are one mark. The maskable version keeps the iris inside the inner 60% of
// the canvas, so Android can crop it to a circle or a squircle without biting into the ring.
//
// Run: CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/pwa-icons/render.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "public/icons");

const BRAND = "#1e5b4a";
const PAPER = "#faf8f3";

// `inset` is the share of the canvas the mark fills: the plain icon uses most of it, the maskable one stays
// well inside the safe zone. The mark is drawn as SVG with the same numbers as IrisMark in
// src/components/public/wordmark.tsx, so the geometry cannot drift from the masthead.
function html(size, inset) {
  const mark = Math.round(size * inset);
  return `<html><head><style>
    * { margin:0; box-sizing:border-box; }
    body { width:${size}px; height:${size}px; background:${BRAND}; display:flex; align-items:center; justify-content:center; }
    svg { display:block; }
  </style></head><body>
    <svg width="${mark}" height="${mark}" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="13" fill="none" stroke="${PAPER}" stroke-width="2.4"></circle>
      <circle cx="16" cy="16" r="5.5" fill="${PAPER}"></circle>
      <circle cx="18" cy="14" r="1.6" fill="${BRAND}"></circle>
    </svg>
  </body></html>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, inset: 0.72 },
  { file: "icon-512.png", size: 512, inset: 0.72 },
  { file: "icon-maskable-512.png", size: 512, inset: 0.56 },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(html(icon.size, icon.inset), { waitUntil: "load" });
  const file = path.join(out, icon.file);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
  console.log("wrote", path.relative(root, file));
}
await browser.close();
