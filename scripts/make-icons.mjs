// Renders the PWA icons (ink square, pitch markings, volt "XI") with the game's own font.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const font = fs.readFileSync(path.resolve("src/fonts/barlow-condensed-latin-800-normal.woff2")).toString("base64");
const html = (size, pad, radius) => `<!doctype html><html><head><style>
@font-face{font-family:B;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:800}
html,body{margin:0;background:transparent}
.i{width:${size}px;height:${size}px;background:#080A09;border-radius:${radius}px;position:relative;overflow:hidden}
.f{position:absolute;inset:${pad}px;border:${size * 0.035}px solid #123328;border-radius:${size * 0.05}px}
.c{position:absolute;left:50%;top:50%;width:${size * 0.28}px;height:${size * 0.28}px;margin:-${size * 0.14}px;border:${size * 0.035}px solid #123328;border-radius:50%;box-sizing:border-box}
.t{position:absolute;inset:0;display:grid;place-items:center;font:800 ${size * 0.5}px/1 B;color:#D9FF43;letter-spacing:.01em;padding-top:${size * 0.03}px}
</style></head><body><div class="i"><div class="f"></div><div class="c"></div><div class="t">XI</div></div></body></html>`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, pad, radius] of [
  ["icon-192.png", 192, 22, 0],
  ["icon-512.png", 512, 58, 0],
  ["maskable-512.png", 512, 110, 0], // content inside the 80% safe zone
  ["apple-touch-icon.png", 180, 20, 0],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(size, pad, radius));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: false });
}
await browser.close();
console.log("icons written");
