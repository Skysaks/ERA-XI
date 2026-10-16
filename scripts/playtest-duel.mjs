// Two-browser Live Duel over HTTP against the authoritative server. Screenshots → $OUT.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const log = (...a) => console.log(...a);

async function ctx(label, viewport, mobile) {
  const c = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const p = await c.newPage();
  p.on("console", (m) => { if (m.type() === "error") errors.push(`[${label}] ${m.text()}`); });
  p.on("pageerror", (e) => errors.push(`[${label}] pageerror ${e.message}`));
  return { c, p };
}

const A = await ctx("A", { width: 390, height: 844 }, true);
const B = await ctx("B", { width: 1280, height: 820 }, false);

// A: home → Live Duel sheet → create
await A.p.goto(BASE);
await A.p.getByRole("button", { name: /^(live duel|duel|duelo)$/i }).first().click();
await A.p.getByLabel("Your name (optional)").fill("Florian");
await A.p.screenshot({ path: `${OUT}/duel-01-sheet.png` });
await A.p.getByRole("button", { name: /create duel/i }).click();
await A.p.waitForSelector("text=Room code");
const link = await A.p.getByLabel("Room link").inputValue();
log("room link", link);
await A.p.screenshot({ path: `${OUT}/duel-02-lobby.png` });

// B: open link → nickname → PLAY (3 steps)
const t0 = Date.now();
await B.p.goto(link);
await B.p.waitForSelector("text=Better XI wins");
await B.p.screenshot({ path: `${OUT}/duel-03-join.png` });
await B.p.getByLabel("Your name (optional)").fill("Anthony");
await B.p.getByRole("button", { name: /^play$/i }).click();
await B.p.waitForSelector("[data-option]");
await A.p.waitForSelector("[data-option]", { timeout: 5000 });
log("join→draft ms", Date.now() - t0);

const offerText = async (p) => (await p.$$eval("[data-option] [data-name]", (els) => els.map((e) => e.textContent).sort().join("|")));
const sameOffers = [];
for (let r = 0; r < 11; r++) {
  await A.p.waitForSelector("[data-option]:not([disabled])", { timeout: 8000 });
  await B.p.waitForSelector("[data-option]:not([disabled])", { timeout: 8000 });
  const oa = await offerText(A.p), ob = await offerText(B.p);
  sameOffers.push(oa === ob);
  // A locks first; B must still see "choosing" and A's pick hidden.
  await A.p.locator("[data-option]").nth(r % 4).click();
  try { await A.p.waitForSelector("text=/Locked · /i", { timeout: 4000 }); } catch (e) {
    await A.p.screenshot({ path: `${OUT}/fail-A-r${r + 1}.png` }); await B.p.screenshot({ path: `${OUT}/fail-B-r${r + 1}.png` });
    throw new Error(`round ${r + 1}: A never showed locked`);
  }
  await B.p.waitForSelector("text=/Florian locked in/i", { timeout: 9000 });
  if (r === 0) {
    await A.p.screenshot({ path: `${OUT}/duel-04-A-locked.png` });
    await B.p.screenshot({ path: `${OUT}/duel-05-B-opponent-ready.png` });
  }
  // Round 2: both take the same option (allowed).
  const bIdx = r === 1 ? (r % 4) : (r + 1) % 4;
  await B.p.locator("[data-option]").nth(bIdx).click();
  await A.p.waitForSelector("text=/→/", { timeout: 4000 });
  if (r === 0 || r === 1) {
    await A.p.waitForTimeout(300);
    await A.p.screenshot({ path: `${OUT}/duel-06-A-reveal-r${r + 1}.png` });
    await B.p.screenshot({ path: `${OUT}/duel-07-B-reveal-r${r + 1}.png` });
  }
  if (r === 5) {
    // Network drop on B mid-duel: go offline, come back, continue.
    await B.c.setOffline(true);
    await A.p.waitForTimeout(7000);
    await A.p.screenshot({ path: `${OUT}/duel-08-A-sees-reconnecting.png` });
    await B.c.setOffline(false);
  }
}
log("identical offers each round:", sameOffers.every(Boolean), sameOffers.length);
await A.p.waitForSelector("text=/You win|wins/i", { timeout: 10000 });
await B.p.waitForSelector("text=/You win|wins/i", { timeout: 10000 });
await A.p.waitForTimeout(600);
await A.p.screenshot({ path: `${OUT}/duel-09-A-result.png`, fullPage: true });
await B.p.screenshot({ path: `${OUT}/duel-10-B-result.png`, fullPage: true });
const scoresA = await A.p.$$eval("main .tnum", (e) => e.slice(0, 2).map((x) => x.textContent));
const scoresB = await B.p.$$eval("main .tnum", (e) => e.slice(0, 2).map((x) => x.textContent));
log("A sees", scoresA, "B sees", scoresB);
const verdictA = await A.p.locator("text=/^(You win|.* wins)$/i").first().textContent();
const verdictB = await B.p.locator("text=/^(You win|.* wins)$/i").first().textContent();
log("verdicts", verdictA, "|", verdictB);

// Rematch: both vote → new draw.
await A.p.getByRole("button", { name: /^rematch$/i }).filter({ visible: true }).first().click();
await B.p.waitForSelector("text=/Florian wants a rematch/i", { timeout: 5000 });
await B.p.screenshot({ path: `${OUT}/duel-11-B-rematch-offer.png` });
await B.p.getByRole("button", { name: /wants a rematch/i }).filter({ visible: true }).first().click();
await A.p.waitForSelector("[data-option]:not([disabled])", { timeout: 6000 });
await B.p.waitForSelector("[data-option]:not([disabled])", { timeout: 6000 });
log("rematch offers identical:", (await offerText(A.p)) === (await offerText(B.p)));

// Server rejects forged / malformed intents.
const bad = await fetch(`${BASE}/api/rooms/${link.split("/r/")[1]}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "intent", token: "x", intent: { type: "lock", round: 0, optionIndex: 9, score: 114 } }) });
log("malformed intent status", bad.status);

// Records sheet shows duel W/L.
await A.p.getByRole("button", { name: /^home$/i }).first().click();
// Mid-game (the rematch already started): leaving asks first.
await A.p.getByRole("button", { name: /^leave$/i }).click();
await A.p.waitForSelector("text=Build an impossible XI");
await A.p.locator('[data-action="myera"]').click();
await A.p.getByRole("button", { name: /your records/i }).last().click();
await A.p.waitForTimeout(400);
await A.p.screenshot({ path: `${OUT}/duel-12-records.png` });
log("records has duels:", await A.p.locator("text=Live Duels").count());

log("errors:", errors.length ? errors : "none");
await browser.close();
