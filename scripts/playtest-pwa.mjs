// PWA check against a production build: manifest, service worker, offline solo play,
// offline challenge deep link. Run `next start -p 3001` first. Screenshots → $OUT.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
const log = (...a) => console.log(...a);

const man = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json();
log("manifest:", man.display, man.start_url, man.icons.map((i) => `${i.sizes}/${i.purpose}`).join(", "));
const sw = await page.request.get(`${BASE}/sw.js`);
log("sw.js:", sw.status(), sw.headers()["cache-control"]);

const t0 = Date.now();
await page.goto(BASE);
await page.getByRole("button", { name: /^play$/i }).waitFor();
log("first interactive (prod, cold):", Date.now() - t0, "ms");
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.waitForTimeout(1500); // let the page post its resource list to the SW
log("sw controlling after reload:", await (async () => { await page.reload(); await page.getByRole("button", { name: /^play$/i }).waitFor(); return page.evaluate(() => Boolean(navigator.serviceWorker.controller)); })());
await page.waitForTimeout(1000);

// Make a challenge link while online.
await page.getByRole("button", { name: /^play$/i }).click();
for (let r = 0; r < 11; r++) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[0].click(); }
await page.getByRole("button", { name: /simulate season|play the season/i }).click();
await page.getByRole("button", { name: /skip/i }).click().catch(() => {});
await page.getByRole("button", { name: /^challenge$/i }).filter({ visible: true }).first().click();
const link = await page.getByLabel("Challenge link").inputValue();
await page.keyboard.press("Escape");

// ── OFFLINE ──
await ctx.setOffline(true);
await page.goto(BASE).catch((e) => errors.push(`offline goto: ${e.message}`));
await page.getByRole("button", { name: /^play$/i }).waitFor({ timeout: 10000 });
log("offline: home loads from cache");
await page.getByRole("button", { name: /^play$/i }).click();
for (let r = 0; r < 11; r++) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[1].click(); }
await page.getByRole("button", { name: /simulate season|play the season/i }).click();
await page.getByRole("button", { name: /skip/i }).click().catch(() => {});
await page.getByRole("button", { name: /^challenge$/i }).filter({ visible: true }).first().waitFor();
log("offline: full solo season played");
await page.screenshot({ path: `${OUT}/pwa-offline-result.png` });
// Lazily loaded surfaces must work offline too (prefetched + cached after the first visit).
await page.getByRole("button", { name: /analyse my xi/i }).filter({ visible: true }).first().click();
const analysisOk = await page.getByText(/why \d+ pts|why this result/i).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
log("offline: analysis opens:", analysisOk);
if (!analysisOk) errors.push("offline: analysis did not open");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /^home$/i }).first().click();
await page.getByRole("button", { name: /^settings$/i }).click();
const settingsOk = await page.locator('[role="dialog"] summary').first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
log("offline: settings open:", settingsOk);
if (!settingsOk) errors.push("offline: settings did not open");
await page.keyboard.press("Escape");

await page.goto(link).catch((e) => errors.push(`offline deep link: ${e.message}`));
const ok = await page.getByText(/play same draft/i).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
log("offline: challenge deep link opens:", ok);
await page.screenshot({ path: `${OUT}/pwa-offline-challenge.png` });

const r = await page.goto(`${BASE}/some/unknown/page`).catch(() => null);
log("offline unknown route →", r ? r.status() : "n/a", (await page.title()));

await browser.close();
console.log(errors.length ? errors.join("\n") : "no errors");
