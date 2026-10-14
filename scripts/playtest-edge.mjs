import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
// invalid link
await page.goto(`${BASE}/c/not-a-real-token`);
await page.waitForSelector("text=broken");
await page.screenshot({ path: `${OUT}/e-01-badlink.png` });
// More modes → Era Lock, 4-2-3-1, keyboard run
await page.getByRole("button", { name: /^modes/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/e-00-modes.png` });
await page.getByRole("button", { name: /era lock/i }).first().click();
await page.getByRole("button", { name: "Close" }).last().click(); // Era Lock keeps the sheet open for the period choice
await page.getByRole("button", { name: "4-2-3-1" }).click();
await page.screenshot({ path: `${OUT}/e-00b-home-eralock.png` });
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
console.log("era lock label:", await page.locator("text=/Era Lock ·/i").first().innerText());
for (let r = 0; r < 11; r++) { await page.waitForTimeout(300); const opts = await page.$$("[data-option]"); let c = opts[0]; for (const o of opts) { if (!/out of position/i.test(await o.innerText())) { c = o; break; } } await c.click(); if (r === 5) await page.screenshot({ path: `${OUT}/e-00c-eralock-draft.png` }); }
await page.getByRole("button", { name: /simulate season|play the season/i }).click();
await page.getByRole("button", { name: /^challenge$/i }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
await page.getByRole("button", { name: /^ERA XI$/i }).first().click().catch(() => {});
await page.goto(BASE);
await page.waitForSelector("text=Play");
// IQ mode + 3-5-2
await page.getByRole("button", { name: "Football IQ" }).click();
await page.getByRole("button", { name: "3-5-2" }).click();
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
const before = await page.locator("h1").innerText();
await page.getByRole("button", { name: /reroll/i }).click();
const after = await page.locator("h1").innerText();
const disabled = await page.getByRole("button", { name: /no rerolls left/i }).isDisabled();
console.log("reroll:", before, "→", after, "disabled after:", disabled);
for (let r = 0; r < 3; r++) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[r % 4].click(); }
await page.screenshot({ path: `${OUT}/e-02-iq-draft.png` });
// keyboard picks
for (let r = 3; r < 11; r++) { await page.waitForTimeout(300); await page.keyboard.press(String((r % 4) + 1)); }
await page.waitForSelector("text=Simulate season");
// swap two players
const slots = page.locator("button[data-slot]");
await slots.nth(1).click(); await slots.nth(2).click();
await page.screenshot({ path: `${OUT}/e-03-iq-xi.png` });
await page.getByRole("button", { name: /simulate season|play the season/i }).click();
await page.getByRole("button", { name: /^challenge$/i }).filter({ visible: true }).first().waitFor({ timeout: 5000 });
console.log("reduced-motion sim auto-finished");
// persistence
await page.goto(BASE);
await page.waitForSelector("text=Best");
console.log("home stats:", await page.locator("header").first().innerText());
await page.screenshot({ path: `${OUT}/e-04-home-returning.png` });
await page.getByRole("button", { name: /your records/i }).last().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/e-05-records.png` });
await browser.close();
console.log(errors.length ? errors : "no errors");
