// Plays several complete runs like a sensible human (avoid out-of-position picks, watch
// the full reveal on some runs) and reports timing, variety and outcomes.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const runs = [
  { formation: "4-3-3", mode: "Classic", watch: true },
  { formation: "4-2-3-1", mode: "Classic", watch: false },
  { formation: "3-5-2", mode: "Football IQ", watch: false },
  { formation: "4-4-2", mode: "Classic", watch: true },
  { formation: "3-4-3", mode: "Classic", watch: false },
  { formation: "4-3-3", mode: "Era Lock", watch: false },
];
const seenEras = [];
await page.goto(BASE);
for (const [i, r] of runs.entries()) {
  await page.waitForSelector("text=Play");
  if (r.mode === "Era Lock") { await page.getByRole("button", { name: /more modes|modes/i }).first().click(); await page.getByRole("button", { name: /era lock/i }).first().click(); await page.getByRole("button", { name: "Close" }).last().click(); }
  else await page.getByRole("button", { name: r.mode, exact: true }).click();
  await page.getByRole("button", { name: r.formation, exact: true }).click();
  const t0 = Date.now();
  await page.getByRole("button", { name: /^play$/i }).click();
  const eras = [];
  let oop = 0, dilemmas = 0;
  for (let k = 0; k < 11; k++) {
    await page.waitForSelector("[data-option]");
    await page.waitForTimeout(300); // human-ish reading time floor
    eras.push(await page.locator("h1").first().innerText() + " " + await page.locator("h1 + span").first().innerText());
    const opts = await page.$$("[data-option]");
    const texts = await Promise.all(opts.map((o) => o.innerText()));
    const ok = texts.map((t) => !/out of position/i.test(t));
    if (ok.filter(Boolean).length >= 2) dilemmas++;
    let idx = ok.indexOf(true); if (idx < 0) { idx = 0; oop++; }
    await opts[idx].click();
  }
  const draftMs = Date.now() - t0;
  await page.waitForSelector("text=Simulate season");
  await page.screenshot({ path: `${OUT}/run${i + 1}-xi.png` });
  const s0 = Date.now();
  await page.getByRole("button", { name: /simulate season|play the season/i }).click();
  if (!r.watch) await page.getByRole("button", { name: /skip/i }).click();
  await page.getByRole("button", { name: /^challenge$/i }).filter({ visible: true }).first().waitFor({ timeout: 10000 });
  const simMs = Date.now() - s0;
  const score = (await page.locator("main").first().innerText()).match(/(\d+)\s*(?:PTS)?\s*\/\s*114/)?.[1];
  const record = (await page.locator("main").first().innerText()).match(/(\d+)W · (\d+)D · (\d+)L/)?.[0];
  await page.screenshot({ path: `${OUT}/run${i + 1}-result.png` });
  seenEras.push(eras);
  console.log(`run ${i + 1} ${r.mode} ${r.formation}: ${score}/114 ${record} | draft ${(draftMs / 1000).toFixed(1)}s (incl. 3.3s bot reading) | sim ${(simMs / 1000).toFixed(1)}s ${r.watch ? "watched" : "skipped"} | forced OOP ${oop} | rounds with ≥2 in-position options ${dilemmas}/11`);
  console.log("   eras:", eras.join(" | "));
  await page.getByRole("button", { name: /play again/i }).filter({ visible: true }).first().click();
  await page.waitForSelector("[data-option]");
  await page.getByRole("button", { name: /^home$/i }).first().click();
}
const all = seenEras.flat();
console.log("distinct eras over 6 runs:", new Set(all).size, "of", all.length);
await browser.close();
console.log(errors.length ? errors : "no errors");
