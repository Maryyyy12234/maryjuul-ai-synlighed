// Genererer app-ikoner (PNG) fra én SVG via den forinstallerede Chromium.
// Kør: npm run icons
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const INK = "#121211", LIME = "#C6F432", PAPER = "#F3F0E8";

// Mærket: et "fanget" kvadrat – en åben ramme (genfang = fang igen) med en lime kerne.
function mark({ size, bg, radius, pad }) {
  const s = 100, p = pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect width="100" height="100" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${p} ${p}) scale(${(100 - 2 * p) / 100})">
    <path d="M78 22 H22 V78 H78 V54 H54" fill="none" stroke="${PAPER}" stroke-width="11" stroke-linecap="square" stroke-linejoin="miter"/>
    <rect x="38" y="38" width="16" height="16" fill="${LIME}"/>
  </g>
</svg>`;
}

const out = [
  ["icon-192.png", 192, mark({ size: 192, bg: INK, radius: 22, pad: 14 })],
  ["icon-512.png", 512, mark({ size: 512, bg: INK, radius: 22, pad: 14 })],
  ["apple-touch-icon.png", 180, mark({ size: 180, bg: INK, radius: 0, pad: 14 })],
  // Maskable: fuld flade, motiv inden for 80 % sikker zone.
  ["maskable-512.png", 512, mark({ size: 512, bg: INK, radius: 0, pad: 24 })],
  // Monokrom badge til Android-statuslinjen.
  ["badge-96.png", 96, `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 100 100"><path d="M78 22 H22 V78 H78 V54 H54" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="square"/><rect x="38" y="38" width="16" height="16" fill="#fff"/></svg>`],
];

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, svg] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const buf = await page.locator("svg").screenshot({ omitBackground: true });
  writeFileSync(`public/icons/${name}`, buf);
  console.log("skrev", name);
}
writeFileSync("public/icons/mark.svg", mark({ size: 512, bg: INK, radius: 22, pad: 14 }));
await browser.close();
