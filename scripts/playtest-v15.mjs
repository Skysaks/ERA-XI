// V1.5 playtest: reposition during the draft, player inspection, formation sheet, XI check +
// OPTIMISE XI (+ undo), ANALYSE MY XI → expected range + turning points → replay from round
// (practice), modes browser (Nations/World XI), formation selector. Screenshots → $OUT.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const log = (...a) => console.log(...a);
const expect = (cond, msg) => { if (!cond) errors.push(`ASSERT: ${msg}`); };
const vis = (page, name) => page.getByRole("button", { name }).filter({ visible: true }).first();

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()} @ ${m.location().url}`); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.addInitScript(() => { try { localStorage.setItem("eraxi:debug", "1"); } catch {} });

await page.goto(BASE);
await page.getByRole("button", { name: /^play$/i }).waitFor();
await page.screenshot({ path: `${OUT}/q01-home.png` });

// Formation selector: recent + more
await page.getByRole("button", { name: /more formations/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/q02-formations.png` });
await page.getByRole("button", { name: "4-2-3-1" }).last().click();
await page.waitForTimeout(200);

// Draft with inspection + reposition
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
await page.getByRole("button", { name: /^details for/i }).first().click();
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/q03-inspect.png` });
await page.keyboard.press("Escape");
for (let r = 0; r < 4; r++) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[r % 3].click(); }
await page.waitForTimeout(300);
// tap a player on the pitch, see destinations
const filled = await page.$$("[data-slot]");
let tapped = false;
for (const el of filled) {
  const label = await el.getAttribute("aria-label");
  if (label && label.includes(",") && !/, GK/.test(label)) { await el.click(); tapped = true; break; }
}
expect(tapped, "a drafted player can be selected on the pitch");
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/q04-reposition.png` });
const dests = await page.locator('[aria-label^="Move here"]').count();
log("destinations shown:", dests);
expect(dests >= 1, "destinations with ratings are shown");
if (dests) await page.locator('[aria-label^="Move here"]').first().click();
await page.waitForTimeout(200);
const debug = await page.getByTestId("solvability").innerText().catch(() => "");
log("dev solvability:", debug);

for (let r = 4; r < 11; r++) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[0].click(); }
await page.getByRole("button", { name: /simulate season|play the season/i }).waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/q05-xi.png` });
const hasCheck = await page.getByText(/xi check/i).count();
log("XI check shown:", hasCheck);

// FIT explanation
await page.getByRole("button", { name: /why this fit/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/q06-fit.png` });
await page.keyboard.press("Escape");

// Formation sheet
await page.getByRole("button", { name: /change formation/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/q07-formation-sheet.png` });
await page.keyboard.press("Escape");

// Optimise
if (hasCheck) {
  await page.getByRole("button", { name: /optimise xi/i }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/q08-optimise.png` });
  const apply = page.getByRole("button", { name: /^apply$/i });
  if (await apply.count()) {
    await apply.click();
    await page.waitForTimeout(300);
    expect(await page.getByRole("button", { name: /undo/i }).count(), "undo offered after optimise");
    await page.screenshot({ path: `${OUT}/q09-optimised.png` });
  } else await page.keyboard.press("Escape");
}

await page.getByRole("button", { name: /simulate season|play the season/i }).click();
await page.getByRole("button", { name: /skip/i }).click().catch(() => {});
await vis(page, /^challenge$/i).waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/q10-result.png` });
await vis(page, /analyse my xi/i).click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/q11-analysis.png` });
await page.screenshot({ path: `${OUT}/q11b-analysis-full.png`, fullPage: true });
const expected = await page.getByText(/^expected$/i).count();
expect(expected > 0, "analysis shows expected range");
const replay = page.getByRole("button", { name: /replay from round/i }).first();
if (await replay.count()) {
  await replay.click();
  await page.waitForSelector("[data-option]");
  const label = await page.locator("main").innerText();
  expect(/practice/i.test(label), "replay-from-round is labelled practice");
  await page.screenshot({ path: `${OUT}/q12-replay.png` });
  while (await page.locator("[data-option]").count()) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[0].click(); }
  await page.getByRole("button", { name: /simulate season|play the season/i }).click();
  await page.getByRole("button", { name: /skip/i }).click().catch(() => {});
  await vis(page, /^challenge$/i).waitFor();
  const tags = await page.locator("header").first().innerText();
  expect(/practice/i.test(tags), "practice result tagged");
  log("practice result header:", tags.replace(/\n/g, " "));
} else log("no turning points for this XI");

// Modes browser
await page.getByRole("button", { name: /^home$/i }).first().click();
await page.getByRole("button", { name: /^modes/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/q13-modes.png` });
await page.getByText("World XI", { exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
const eras = [];
for (let r = 0; r < 11; r++) {
  await page.waitForTimeout(300);
  eras.push((await page.locator("h1").first().innerText()).trim());
  await (await page.$$("[data-option]"))[0].click();
}
log("World XI nations:", eras.join(", "));
expect(new Set(eras).size === 11, "World XI: eleven different nations");

await browser.close();
console.log(errors.length ? errors.join("\n") : "OK — no errors, all assertions passed");
