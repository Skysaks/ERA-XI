// V2.0 multiplayer hardening: two real browsers (iPhone-size EN + Android-size FR) against the
// authoritative HTTP server. Exercises the interruptions a phone actually suffers.
// Usage: BASE=http://localhost:3001 OUT=/tmp/shots node scripts/playtest-v20-duel.mjs
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const checks = [];
const check = (name, ok, extra = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

async function ctx(label, viewport, locale) {
  const c = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale });
  const p = await c.newPage();
  p.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errors.push(`[${label}] ${m.text()}`);
  });
  p.on("pageerror", (e) => errors.push(`[${label}] pageerror ${e.message}`));
  return { c, p };
}

// 0. Invalid code: a clear message, not a spinner.
{
  const X = await ctx("X", { width: 390, height: 844 }, "en-GB");
  await X.p.goto(`${BASE}/r/zzzzz`);
  await X.p.getByRole("button", { name: /^play$/i }).click().catch(() => {});
  const shown = await X.p.waitForSelector("text=/closed or never existed/i", { timeout: 8000 }).then(() => true, () => false);
  check("invalid room code → 'closed or never existed'", shown);
  await X.c.close();
}

const A = await ctx("A-iPhone-EN", { width: 390, height: 844 }, "en-GB");
const B = await ctx("B-Android-FR", { width: 360, height: 800 }, "fr-FR");

await A.p.goto(BASE);
await A.p.getByRole("button", { name: /^(live duel|duel)$/i }).first().click();
await A.p.getByLabel("Your name (optional)").fill("Florian");
await A.p.getByRole("button", { name: /create duel/i }).click();
await A.p.waitForSelector("text=Room code");
const link = await A.p.getByLabel("Room link").inputValue();
const code = link.split("/r/")[1];

await B.p.goto(link);
await B.p.waitForSelector("text=Le meilleur XI gagne");
check("different languages: joiner sees the room in French", true);
await B.p.getByLabel("Ton pseudo (facultatif)").fill("Anthony");
await B.p.getByRole("button", { name: /^jouer$/i }).click();
await B.p.waitForSelector("[data-option]");
await A.p.waitForSelector("[data-option]", { timeout: 8000 });

const ids = async (p) => (await p.$$eval("[data-option]", (els) => els.map((e) => e.getAttribute("data-option-id") ?? e.querySelector("[data-name]")?.textContent ?? "")));
const ready = (p) => p.waitForSelector("[data-option]:not([disabled])", { timeout: 12000 });
const posted = [];
A.p.on("request", (r) => { if (r.method() === "POST" && r.url().includes(`/api/rooms/${code}`)) posted.push(r.postData() ?? ""); });

for (let r = 0; r < 11; r++) {
  await ready(A.p);
  await ready(B.p);
  if (r === 0) {
    // Names differ by language only in chrome; the offer (player ids / names) must match.
    const oa = (await ids(A.p)).join("|"), ob = (await ids(B.p)).join("|");
    check("identical offers (EN vs FR client)", oa === ob);
    // Double tap: must lock once.
    await A.p.locator("[data-option]").nth(0).dblclick();
    await A.p.waitForTimeout(500);
    const locks = posted.filter((b) => b.includes('"lock"')).length;
    check("double tap sends one lock", locks === 1, `${locks} lock POST`);
  } else {
    await A.p.locator("[data-option]").nth(r % 4).click();
  }
  await A.p.waitForSelector("text=/Locked · /i", { timeout: 6000 });
  await B.p.waitForSelector("text=/Florian a validé/i", { timeout: 9000 });

  if (r === 2) {
    // A refreshes while locked and waiting: must come back locked, pick still hidden from B.
    await A.p.reload();
    const back = await A.p.waitForSelector("text=/Locked · /i", { timeout: 10000 }).then(() => true, () => false);
    check("refresh after locking → back in the room, still locked", back);
    // What B's phone actually receives from the server for this round: no pick, just "locked".
    const tokB = await B.p.evaluate(() => localStorage.getItem("eraxi:device"));
    const snapB = (await (await fetch(`${BASE}/api/rooms/${code}`, { headers: { "x-seat-token": tokB } })).json()).snapshot;
    const opp = snapB.seats.find((s) => !s.you);
    check("opponent's pick stays secret until both lock", opp.progress === 3 && opp.picks[2] === null, `progress ${opp.progress}, pick ${opp.picks[2]}`);
  }
  if (r === 4) {
    // B "backgrounds" the app (phone lock): offline 12 s + hidden, then resumes.
    await B.c.setOffline(true);
    await A.p.waitForTimeout(8000);
    const sees = await A.p.locator("text=/reconnect/i").count();
    check("A sees the opponent reconnecting (not a spinner)", sees > 0);
    await A.p.screenshot({ path: `${OUT}/v20-A-opp-reconnecting.png` });
    await B.p.waitForTimeout(4000);
    await B.c.setOffline(false);
    await B.p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const resumed = await ready(B.p).then(() => true, () => false);
    check("B resumes after 12 s offline", resumed);
  }
  // Same player for both in round 2.
  const bIdx = r === 1 ? 1 : (r + 1) % 4;
  await B.p.locator("[data-option]").nth(bIdx).click();
  if (r === 6) {
    // B refreshes during the reveal.
    await B.p.waitForSelector("text=/→/", { timeout: 6000 }).catch(() => {});
    await B.p.reload();
    const back = await B.p.locator("[data-option]").first().or(B.p.getByText(/Florian a validé|Validé ·/i)).first().waitFor({ timeout: 12000 }).then(() => true, () => false);
    check("refresh during reveal → back in the draft", back);
  }
}

await A.p.waitForSelector("text=/You win|wins$/i", { timeout: 15000 });
await B.p.waitForSelector("text=/Tu gagnes|gagne$/i", { timeout: 15000 });
const scoreA = await A.p.$$eval("main .tnum", (e) => e.slice(0, 2).map((x) => x.textContent));
const scoreB = await B.p.$$eval("main .tnum", (e) => e.slice(0, 2).map((x) => x.textContent));
check("both phones agree on the score", scoreA[0] === scoreB[1] && scoreA[1] === scoreB[0], `${scoreA} vs ${scoreB}`);
check("ratings comparison present", (await A.p.locator('[data-testid="duel-ratings"]').count()) === 1);
await A.p.screenshot({ path: `${OUT}/v20-A-result.png`, fullPage: true });
await B.p.screenshot({ path: `${OUT}/v20-B-result-fr.png`, fullPage: true });

// Refresh on the final result.
await A.p.reload();
const resultBack = await A.p.waitForSelector("text=/You win|wins$/i", { timeout: 12000 }).then(() => true, () => false);
check("refresh on final result → same result", resultBack);

// Simultaneous rematch.
const stranger = (await (await fetch(`${BASE}/api/rooms/${code}`, { headers: { "x-seat-token": "stranger-token-000000" } })).json()).snapshot;
check("a stranger with the link sees no picks and no scores", stranger.seats.every((s) => s.picks.every((x) => x === null) && s.score === null));
await Promise.all([
  A.p.getByRole("button", { name: /^rematch$|wants a rematch/i }).filter({ visible: true }).first().click(),
  B.p.getByRole("button", { name: /^revanche$|veut une revanche/i }).filter({ visible: true }).first().click(),
]);
const rematched = await Promise.all([ready(A.p), ready(B.p)]).then(() => true, () => false);
check("simultaneous rematch → one new draw for both", rematched);
check("rematch offers identical", (await ids(A.p)).join("|") === (await ids(B.p)).join("|"));

// Practice: leave, then the result screen's "This draw, solo" is covered by e2e; here, leave cleanly.
await A.p.getByRole("button", { name: /^home$/i }).first().click();
await A.p.getByRole("button", { name: /^leave$/i }).click();
await A.p.waitForSelector("[data-cta]");
const bLeft = await B.p.waitForSelector("text=/est parti|left/i", { timeout: 12000 }).then(() => true, () => false);
check("B is told the opponent left", bLeft);
await B.p.screenshot({ path: `${OUT}/v20-B-opponent-left.png` });
// B picks once more, then finishes the draw solo (practice, not recorded) instead of being stuck.
await ready(B.p);
await B.p.locator("[data-option]").nth(0).click();
const solo = await B.p.locator('[data-action="finish-solo"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
check("opponent gone → 'Finish solo' offered", solo);
if (solo) {
  await B.p.locator('[data-action="finish-solo"]').first().click();
  await ready(B.p);
  const round = await B.p.getByText(/0?2\s?\/\s?11/).count();
  check("solo run continues from B's own picks (round 2)", round > 0 && new URL(B.p.url()).pathname === "/");
  await B.p.screenshot({ path: `${OUT}/v20-B-finish-solo.png` });
}

console.log("errors:", errors.length ? errors : "none");
console.log(`${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
await browser.close();
process.exit(checks.every((c) => c.ok) && !errors.length ? 0 : 1);
