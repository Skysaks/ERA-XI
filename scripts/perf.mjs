// Performance measurement on the production build (mid-range phone profile: 4× CPU slowdown).
//   BASE=http://localhost:3001 node scripts/perf.mjs
// Reports: JS bytes before first interaction, lazily prefetched bytes, time to PLAY, CLS,
// pick → next offer latency, long tasks on XI Complete (formation projections) and on the result.
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
// Chunks the route needs before it can run (from the build's own diagnostics), vs idle prefetch.
const statsFile = ".next/diagnostics/route-bundle-stats.json";
const critical = new Set(
  existsSync(statsFile) ? JSON.parse(readFileSync(statsFile, "utf8")).find((r) => r.route === "/")?.firstLoadChunkPaths.map((p) => p.split("/").pop()) ?? [] : [],
);
const BASE = process.env.BASE ?? "http://localhost:3001";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US" });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await cdp.send("Network.enable");
const js = [];
cdp.on("Network.loadingFinished", (e) => js.push({ id: e.requestId, bytes: e.encodedDataLength, t: Date.now() }));
const urls = new Map();
cdp.on("Network.responseReceived", (e) => urls.set(e.requestId, e.response.url));
await page.addInitScript(() => {
  window.__cls = 0;
  window.__long = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__cls += e.value))).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: true });
});
const t0 = Date.now();
await page.goto(BASE);
await page.getByRole("button", { name: /^play$/i }).waitFor();
const tPlay = Date.now() - t0;
const firstCount = js.filter((r) => /\.js/.test(urls.get(r.id) ?? "")).length;
const firstBytes = js.filter((r) => /\.js/.test(urls.get(r.id) ?? "")).reduce((a, r) => a + r.bytes, 0);
await page.waitForTimeout(5000); // idle prefetch of secondary chunks
const allBytes = js.filter((r) => /\.js/.test(urls.get(r.id) ?? "")).reduce((a, r) => a + r.bytes, 0);
const allCount = js.filter((r) => /\.js/.test(urls.get(r.id) ?? "")).length;
const crit = js.filter((r) => critical.has((urls.get(r.id) ?? "").split("/").pop()));
const critBytes = crit.reduce((a, r) => a + r.bytes, 0);
const clsHome = await page.evaluate(() => window.__cls);

await page.evaluate(() => (window.__long = []));
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
const lat = [];
for (let r = 0; r < 11; r++) {
  await page.waitForTimeout(350);
  const before = await page.locator("h1").first().innerText();
  const t = Date.now();
  await (await page.$$("[data-option]"))[r % 3].click();
  if (r < 10) await page.waitForFunction((b) => document.querySelector("h1")?.textContent !== b, before, { timeout: 5000 }).catch(() => {});
  else await page.getByRole("button", { name: /simulate season|play the season/i }).waitFor();
  lat.push(Date.now() - t);
}
const longDraft = await page.evaluate(() => window.__long.slice());
await page.evaluate(() => (window.__long = []));
await page.waitForTimeout(2500); // projections run after paint, one formation per task
const longXI = await page.evaluate(() => window.__long.slice());
await page.getByRole("button", { name: /simulate season|play the season/i }).click();
const skip = page.getByRole("button", { name: /skip/i });
if (await skip.count()) await skip.click().catch(() => {});
await page.getByRole("button", { name: /^challenge$/i }).filter({ visible: true }).first().waitFor();
await page.evaluate(() => (window.__long = []));
await page.getByRole("button", { name: /analyse my xi/i }).filter({ visible: true }).first().click();
await page.waitForTimeout(1500);
const longAnalysis = await page.evaluate(() => window.__long.slice());
const cls = await page.evaluate(() => window.__cls);

const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`CPU ×4 · 390×844
JS transferred when PLAY is visible: ${kb(firstBytes)} in ${firstCount} files (compressed)
  of which first-load (critical) chunks: ${kb(critBytes)} in ${crit.length} files; the rest is idle prefetch (it starts during the font gate)
JS after 5 s idle (secondary surfaces prefetched): ${kb(allBytes)} in ${allCount} files
time to PLAY visible (local server): ${tPlay} ms
CLS home: ${clsHome.toFixed(3)} · CLS whole run: ${cls.toFixed(3)}
pick → next offer rendered: median ${med(lat)} ms · max ${Math.max(...lat)} ms
long tasks during the draft: ${longDraft.length ? longDraft.join(", ") + " ms" : "none"}
long tasks on XI Complete (projections): ${longXI.length ? longXI.join(", ") + " ms" : "none"}
long tasks opening Analysis: ${longAnalysis.length ? longAnalysis.join(", ") + " ms" : "none"}`);
await browser.close();
