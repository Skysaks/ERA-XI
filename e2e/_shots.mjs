import { chromium } from "playwright-core";
const OUT = process.env.OUT; const L = process.env.L ?? "fr-FR"; const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
const b = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: L });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:3001");
await page.waitForSelector("[data-cta]");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/home-new-${L}-${W}.png` });
// play 3 quick games
for (let g = 0; g < 3; g++) {
  await page.locator("[data-cta]").click();
  await page.waitForSelector("[data-option]");
  for (let r = 0; r < 11; r++) { await page.waitForTimeout(220); await (await page.$$("[data-option]"))[r % 3].click(); }
  await page.locator("main button").filter({ hasText: /simul/i }).first().click();
  const skip = page.getByRole("button", { name: /skip|passer|saltar/i }); await page.waitForTimeout(300); if (await skip.count()) await skip.first().click().catch(() => {});
  await page.waitForSelector('[data-action="analyse"]');
  if (g === 2) { await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/result-${L}-${W}.png` }); await page.locator('[data-action="analyse"]').click(); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/analysis-${L}-${W}.png` }); await page.keyboard.press("Escape"); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/result-after-${L}-${W}.png` }); }
  await page.getByRole("button", { name: /^home$|^accueil$|^inicio$/i }).first().click();
  await page.waitForSelector("[data-cta]");
}
// inject rivals + feed
await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem("eraxi:v1"));
  const now = Date.now();
  p.name = "Flo";
  p.challenges = [
    { at: now - 3600e3, token: "a", opponent: "Anthony", theirs: 98, yours: 91 },
    { at: now - 86400e3 * 2, token: "b", opponent: "Anthony", theirs: 88, yours: 95 },
    { at: now - 86400e3 * 3, token: "c", opponent: "Anthony", theirs: 90, yours: 97 },
    { at: now - 86400e3 * 4, token: "d", opponent: "Lucas", theirs: 80, yours: 84 },
    { at: now - 86400e3 * 5, token: "e", opponent: "Lucas", theirs: 85, yours: 84 },
  ];
  p.feed = [{ at: now - 3600e3, k: "vs", opp: "Anthony", yours: 91, theirs: 98, won: false }, ...p.feed];
  localStorage.setItem("eraxi:v1", JSON.stringify(p));
});
await page.reload(); await page.waitForSelector("[data-cta]"); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/home-returning-${L}-${W}.png` });
await page.locator('[data-action="myera"]').click(); await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/myera-${L}-${W}.png` });
await page.locator('[role="dialog"] > div').last().evaluate((el) => el.scrollTo(0, 2000)); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/myera2-${L}-${W}.png` });
await page.keyboard.press("Escape");
await page.locator('[data-action="help"]').click(); await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/help-${L}-${W}.png` });
await page.locator('[role="dialog"] li button').first().click(); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/help-open-${L}-${W}.png` });
await page.keyboard.press("Escape");
await page.locator('[data-action="myera"]').click(); await page.waitForTimeout(800);
await page.locator('[role="dialog"] button').filter({ hasText: /passe|pass/i }).first().click(); await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/passport-${L}-${W}.png` });
console.log("errors", errs.length, errs.slice(0, 3).join(" | "));
await b.close();
