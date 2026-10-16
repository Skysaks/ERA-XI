// End-to-end playtest: mobile + desktop, full loop incl. challenge. Screenshots → $OUT.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const vis = (page, name) => page.getByRole("button", { name }).filter({ visible: true }).first();

async function run(label, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${label}] console: ${m.text()} @ ${JSON.stringify(m.location())}`); });
  page.on("pageerror", (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`[${label}] ${r.status()} ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(BASE);
  await page.waitForSelector("text=Play");
  await page.screenshot({ path: `${OUT}/${label}-01-home.png` });
  let clicks = 0;
  await page.getByRole("button", { name: /^play$/i }).click(); clicks++;
  await page.waitForSelector("[data-option]");
  await page.screenshot({ path: `${OUT}/${label}-02-draft-r1.png` });
  for (let r = 0; r < 11; r++) {
    await page.waitForTimeout(300);
    // pick first option that doesn't land out of position, else first
    const opts = await page.$$("[data-option]");
    let chosen = opts[0];
    for (const o of opts) { const t = await o.innerText(); if (!/out of position/i.test(t)) { chosen = o; break; } }
    await chosen.click(); clicks++;
    if (r === 3) { await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/${label}-03-draft-r5.png` }); }
    if (r === 8) { await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/${label}-04-draft-r10.png` }); }
  }
  await page.waitForSelector("text=Simulate season");
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${label}-05-xi.png` });
  await page.getByRole("button", { name: /simulate season|play the season/i }).click(); clicks++;
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${label}-06-sim.png` });
  await page.getByRole("button", { name: /skip/i }).click(); clicks++;
  await vis(page, /^challenge$/i).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${label}-07-result.png` });
  const draftMs = Date.now() - t0;
  await vis(page, /^challenge$/i).click();
  await page.getByPlaceholder("e.g. Florian").fill("Florian");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${label}-08-share.png` });
  const link = await page.getByLabel("Challenge link").inputValue();
  // Download the card image via the fallback path
  if (await page.getByRole("button", { name: /share image/i }).count()) {
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }).catch(() => null), page.getByRole("button", { name: /share image/i }).click()]);
    if (dl) await dl.saveAs(`${OUT}/${label}-card.png`);
  }
  await page.keyboard.press("Escape");
  await vis(page, /analyse my xi/i).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${label}-09-analysis.png`, fullPage: false });
  await page.keyboard.press("Escape");

  // Challenger
  const ctx2 = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch: isMobile });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errors.push(`[${label} challenger] pageerror: ${e.message}`));
  p2.on("console", (m) => { if (m.type() === "error") errors.push(`[${label} challenger] console: ${m.text()}`); });
  await p2.goto(link);
  await p2.waitForSelector("text=Play same draft");
  await p2.screenshot({ path: `${OUT}/${label}-10-challenge-intro.png` });
  await p2.getByRole("button", { name: /play same draft/i }).click();
  for (let r = 0; r < 11; r++) {
    await p2.waitForTimeout(240);
    const opts = await p2.$$("[data-option]");
    await opts[(r * 3) % 4].click();
  }
  await p2.getByRole("button", { name: /simulate season|play the season/i }).click();
  await p2.getByRole("button", { name: /skip/i }).click();
  await vis(p2, /^rematch$/i).waitFor();
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: `${OUT}/${label}-11-rival.png` });
  await p2.screenshot({ path: `${OUT}/${label}-11b-rival-full.png`, fullPage: true });
  console.log(label, { clicksToResult: clicks, msToResult: draftMs, link: link.slice(0, 80) + "…" });
  await ctx.close(); await ctx2.close();
}

await run("m", { width: 390, height: 844 }, true);
await run("d", { width: 1440, height: 900 }, false);
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");
