// Renders the PNG icon set, plus the favicon, from assets/safebite-mark.svg with the Playwright
// Chromium that the browser tests already install. Run: `npm run icons` (from web/). Output is
// committed.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");
const GROUND = "#1f7a4d";

// Rewraps the mark's inner elements (stripped of its own comments) inside the favicon's green
// rounded square, matching public/favicon.svg's committed structure.
async function renderFavicon(markSvg) {
  const start = markSvg.indexOf(">") + 1;
  const end = markSvg.lastIndexOf("</svg>");
  const inner = markSvg
    .slice(start, end)
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `    ${line}`)
    .join("\n");
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" id="safebite-mark-favicon" fill="none">
  <rect width="100" height="100" rx="22" fill="${GROUND}"/>
  <g transform="translate(15 15) scale(0.7)">
${inner}
  </g>
</svg>
`;
  await writeFile(path.join(publicDir, "favicon.svg"), favicon);
  console.log("wrote favicon.svg");
}

// radius: corner radius as a fraction of the size (0 = square; iOS and maskable icons are
// masked by the platform). glyph: glyph width as a fraction of the size (maskable icons keep
// the glyph inside the 80% safe zone).
const ICONS = [
  { file: "pwa-192.png", size: 192, radius: 0.22, glyph: 0.72 },
  { file: "pwa-512.png", size: 512, radius: 0.22, glyph: 0.72 },
  { file: "pwa-maskable-512.png", size: 512, radius: 0, glyph: 0.6 },
  { file: "apple-touch-icon-180.png", size: 180, radius: 0, glyph: 0.72 },
];

const svg = await readFile(path.resolve(here, "../assets/safebite-mark.svg"), "utf8");
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

await renderFavicon(svg);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const icon of ICONS) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
      <div id="icon" style="width:${icon.size}px;height:${icon.size}px;background:${GROUND};
        border-radius:${Math.round(icon.size * icon.radius)}px;display:grid;place-items:center">
        <img src="${dataUrl}" style="width:${Math.round(icon.size * icon.glyph)}px;height:${Math.round(icon.size * icon.glyph)}px" />
      </div></body></html>`);
    await page.locator("#icon img").evaluate((img) => img.decode());
    await page.locator("#icon").screenshot({ path: path.join(publicDir, icon.file), omitBackground: true });
    console.log(`wrote ${icon.file} (${icon.size}px)`);
  }
} finally {
  await browser.close();
}
