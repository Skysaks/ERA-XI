// Party room (3 browsers over HTTP) + practice duel vs bot. Screenshots → $OUT.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const log = (...a) => console.log(...a);
async function ctx(label) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(`[${label}] ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`[${label}] ${m.text()}`); });
  return p;
}
const [A, B, C] = [await ctx("A"), await ctx("B"), await ctx("C")];
await A.goto(BASE);
await A.getByRole("button", { name: /^(live duel|duel|duelo)$/i }).first().click();
await A.getByRole("button", { name: /party room/i }).click();
await A.getByLabel("Your name (optional)").fill("Host");
await A.getByRole("button", { name: /create party/i }).click();
await A.waitForSelector("text=Room code");
const link = await A.getByLabel("Room link").inputValue();
for (const [p, n] of [[B, "Bea"], [C, "Cris"]]) {
  await p.goto(link);
  await p.getByLabel("Your name (optional)").fill(n);
  await p.getByRole("button", { name: /^play$/i }).click();
  await p.waitForSelector("text=Start drafting");
}
await A.waitForTimeout(1500);
await A.screenshot({ path: `${OUT}/party-01-lobby.png` });
log("lobby lists", await A.locator("li:has-text('Cris')").count() > 0);
async function draft(p, speed, bias) {
  await p.getByRole("button", { name: /start drafting/i }).click();
  for (let r = 0; r < 11; r++) {
    try { await p.waitForSelector("[data-option]:not([disabled])", { timeout: 8000 }); } catch (e) { await p.screenshot({ path: `${OUT}/fail-party-b${bias}-r${r + 1}.png` }); throw new Error(`party bias ${bias} stuck at round ${r + 1}`); }
    await p.waitForTimeout(speed);
    await p.locator("[data-option]").nth((r + bias) % 4).click();
  }
}
// Independent pace: Bea is fast, Cris slow; Bea finishes without waiting.
await Promise.all([draft(A, 350, 0), draft(B, 120, 1), draft(C, 900, 2)].map((x, i) => x.then(() => log("finished", ["Host", "Bea", "Cris"][i], Date.now()))));
await A.waitForSelector("text=Final table", { timeout: 15000 });
await A.waitForTimeout(500);
await A.screenshot({ path: `${OUT}/party-02-table.png`, fullPage: true });
const rows = await A.$$eval("ol li", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
log("table", rows);
await A.getByRole("button", { name: /run it back/i }).click();
const back = await B.waitForSelector("[aria-label='Round 1 of 11']", { timeout: 8000 }).then(() => true).catch(() => false);
log("run it back → Bea straight into round 1 of the new draw:", back);
await B.screenshot({ path: `${OUT}/party-03-runback.png` });

// Practice duel from the lobby of an unanswered duel.
const P = await ctx("P");
await P.goto(BASE);
await P.getByRole("button", { name: /^(live duel|duel|duelo)$/i }).first().click();
await P.getByRole("button", { name: /create duel/i }).click();
await P.getByRole("button", { name: /practice vs bot/i }).click();
for (let r = 0; r < 11; r++) {
  await P.waitForSelector("[data-option]:not([disabled])", { timeout: 10000 });
  await P.locator("[data-option]").first().click();
  if (r === 3) { await P.waitForSelector("text=/→/"); await P.screenshot({ path: `${OUT}/practice-01-reveal.png` }); }
}
await P.waitForSelector("text=/You win|wins/i", { timeout: 15000 });
await P.screenshot({ path: `${OUT}/practice-02-result.png` });
log("practice result:", await P.locator("text=/^(You win|.* wins)$/i").first().textContent());
log("errors:", errors.length ? errors : "none");
await browser.close();
