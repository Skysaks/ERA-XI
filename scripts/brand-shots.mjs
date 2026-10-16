// Screens that carry the brand, at one viewport: before/after comparison for visual passes.
// BASE=http://localhost:3001 OUT=/tmp/shots W=390 H=844 L=en-GB TAG=after node scripts/brand-shots.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const L = process.env.L ?? "en-GB";
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
const TAG = process.env.TAG ?? "shot";
const b = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: L });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const shot = (n) => page.screenshot({ path: `${OUT}/${TAG}-${n}-${W}.png` });
const metrics = {};

await page.goto(BASE);
await page.waitForSelector("[data-cta]");
await page.waitForTimeout(500);
await shot("01-home");
await page.locator("[data-cta]").click();
await page.waitForSelector("[data-option]");
await page.waitForTimeout(250);
await shot("02-draft-r1");
// Is the full choice visible without scrolling? (last option's bottom inside the viewport)
metrics.optionsBottom = await page.$$eval("[data-option]", (els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
for (let r = 0; r < 11; r++) {
  await page.waitForTimeout(200);
  await (await page.$$("[data-option]"))[r % 3].click();
  if (r === 5) {
    await page.waitForTimeout(250);
    await shot("03-draft-r7");
  }
}
await page.waitForTimeout(700);
await shot("04-xi-complete");
await page.locator("main button").filter({ hasText: /play the season|simul/i }).first().click();
await page.waitForTimeout(900);
await shot("05-sim");
const skip = page.getByRole("button", { name: /skip/i });
if (await skip.count()) await skip.first().click().catch(() => {});
await page.waitForSelector('[data-action="analyse"]');
await page.waitForTimeout(900);
await shot("06-result");
await page.getByRole("button", { name: /^home$/i }).first().click();
await page.waitForSelector("[data-cta]");
await page.waitForTimeout(400);
await shot("07-home-returning");
if (await page.locator('[data-action="myera"]').count()) {
  await page.locator('[data-action="myera"]').click();
  await page.waitForTimeout(900);
  await shot("08-myera");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}
await page.getByRole("button", { name: /^modes/i }).click().catch(() => {});
await page.waitForTimeout(500);
await shot("09-modes");
console.log(JSON.stringify({ W, H, ...metrics, errors: errs }));
await b.close();
