// V1.4 persona playtest: new → returning (resume, Back) → daily (official vs practice) →
// run it back → modes/settings/passport → challenge receiver. Screenshots → $OUT.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const log = (...a) => console.log(...a);
const vis = (page, name) => page.getByRole("button", { name }).filter({ visible: true }).first();
const expect = (cond, msg) => { if (!cond) errors.push(`ASSERT: ${msg}`); };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()} @ ${m.location().url}`); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

async function pick(n, p = page) {
  for (let r = 0; r < n; r++) {
    await p.waitForTimeout(300);
    const opts = await p.$$("[data-option]");
    await opts[r % opts.length].click();
  }
}
async function finish(p = page) {
  await p.getByRole("button", { name: /simulate season|play the season|simuler la saison|jouer la saison/i }).click();
  const skip = p.getByRole("button", { name: /skip|passer/i });
  if (await skip.count()) await skip.click().catch(() => {});
}

// ── NEW PLAYER ──
const t0 = Date.now();
await page.goto(BASE);
await page.getByRole("button", { name: /^play$/i }).waitFor();
expect(!(await page.getByText(/install/i).count()), "no install prompt for a new player");
expect(!(await page.getByText(/resume draft/i).count()), "no resume card for a new player");
await page.screenshot({ path: `${OUT}/p01-new-home.png` });
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
log("new player: first offer after", Date.now() - t0, "ms");

// ── HOME MID-DRAFT: no confirmation, RESUME card ──
await pick(6);
await page.waitForTimeout(250);
await page.getByRole("button", { name: /^home$/i }).first().click();
await page.getByRole("button", { name: /^play$/i }).waitFor();
expect(!(await page.getByText(/leave/i).filter({ visible: true }).count()), "no leave confirmation in solo");
const resumeText = await page.getByText(/resume draft/i).first().locator("..").innerText().catch(() => "");
log("resume card:", resumeText.replace(/\n/g, " | "));
expect(/6 \/ 11/.test(resumeText), "resume card shows 6 / 11");
await page.screenshot({ path: `${OUT}/p02-resume-home.png` });

// Reload: the resume survives
await page.reload();
await page.getByText(/resume draft/i).first().waitFor();
await page.getByText(/resume draft/i).first().click();
await page.waitForSelector("[data-option]");
const progress = await page.locator('[aria-label^="Round"]').first().innerText().catch(() => "");
log("resumed at", progress.replace(/\s+/g, " "));
expect(/07/.test(progress), "resumed on round 7");

// Browser Back from the draft → Home, still resumable
await page.goBack();
await page.getByRole("button", { name: /^play$/i }).waitFor();
expect(await page.getByText(/resume draft/i).count(), "Back keeps the resume");
await page.getByText(/resume draft/i).first().click();
await page.waitForSelector("[data-option]");
await pick(5);
await finish();
await vis(page, /^challenge$/i).waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/p03-result.png` });
const why = await page.getByRole("button", { name: /analyse my xi/i }).first().innerText().catch(() => "");
log("why line:", why.replace(/\n/g, " | "));

// Analysis → reconsider
await page.getByRole("button", { name: /analyse my xi/i }).first().click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/p04-analysis.png` });
log("reconsider rows:", await page.getByText(/worth reconsidering/i).count());
await page.keyboard.press("Escape");

// RUN IT BACK: same first offer
const firstClub = async () => (await page.locator("h1").first().innerText()).trim();
await vis(page, /run it back/i).click();
await page.waitForSelector("[data-option]");
const club1 = await firstClub();
await pick(11);
await finish();
await vis(page, /^challenge$/i).waitFor();
await vis(page, /run it back/i).click();
await page.waitForSelector("[data-option]");
expect((await firstClub()) === club1, "run it back replays the same first offer");
await page.getByRole("button", { name: /^home$/i }).first().click();

// ── DAILY: official, then practice ──
await page.getByRole("button", { name: /daily xi/i }).first().click();
await page.waitForSelector("[data-option]");
await pick(11);
await finish();
await vis(page, /^challenge$/i).waitFor();
const tag1 = await page.getByText(/daily · (official|practice)/i).first().innerText();
await vis(page, /run it back/i).click();
await page.waitForSelector("[data-option]");
const label = await page.getByText(/practice/i).first().innerText().catch(() => "");
log("daily replay label:", label);
expect(/practice/i.test(label), "daily replay is labelled practice");
await pick(11);
await finish();
await vis(page, /^challenge$/i).waitFor();
const tag2 = await page.getByText(/daily · (official|practice)/i).first().innerText();
log("daily tags:", tag1, "→", tag2);
expect(/official/i.test(tag1) && /practice/i.test(tag2), "official then practice");
await page.getByRole("button", { name: /^home$/i }).first().click();

// ── RETURNING HOME: FORM, records, modes, settings, passport ──
await page.getByRole("button", { name: /^play$/i }).waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/p05-returning-home.png` });
const installShown = await page.getByText(/add era xi to your home screen/i).count();
log("install suggestion on returning (engaged) player:", installShown, "(needs beforeinstallprompt — expected 0 in headless dev)");
await page.getByRole("button", { name: /^modes/i }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/p06-modes.png` });
await page.getByText("One League", { exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/p07-modes-league.png` });
await page.getByRole("button", { name: /^italy$/i }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/p08-home-league.png` });
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
const lbl = await page.locator("main").innerText();
expect(/ITALY/.test(lbl), "one league label on draft");
await pick(2);
await page.getByRole("button", { name: /^home$/i }).first().click();
// discard resume
await page.getByRole("button", { name: /discard saved draft/i }).click();
expect(!(await page.getByText(/resume draft/i).count()), "discard removes the card");

await page.getByRole("button", { name: /^settings$/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/p09-settings.png` });
await page.locator("summary", { hasText: /experience/i }).click();
await page.locator("summary", { hasText: /account/i }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/p10-settings-open.png`, fullPage: true });
// Instant simulation
await page.getByRole("button", { name: /^instant$/i }).click();
await page.getByRole("switch", { name: /high contrast/i }).check({ force: true }).catch(async () => { await page.getByText("High contrast").click(); });
const contrast = await page.evaluate(() => document.documentElement.dataset.contrast);
expect(contrast === "high", "high contrast applied to <html>");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /records/i }).last().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/p11-records.png` });
await page.getByRole("button", { name: /era passport/i }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/p12-passport.png` });
await page.keyboard.press("Escape");

// Instant sim: SIMULATE → result immediately
await page.getByRole("button", { name: /^classic$/i }).click();
await page.getByRole("button", { name: /^play$/i }).click();
await page.waitForSelector("[data-option]");
await pick(11);
const ts = Date.now();
await page.getByRole("button", { name: /simulate season|play the season/i }).click();
await vis(page, /^challenge$/i).waitFor();
log("instant sim → result in", Date.now() - ts, "ms");
await page.screenshot({ path: `${OUT}/p13-contrast-result.png` });

// ── FRIEND RECEIVING A CHALLENGE ──
await vis(page, /^challenge$/i).click();
const link = await page.getByLabel("Challenge link").inputValue();
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
const p2 = await ctx2.newPage();
p2.on("pageerror", (e) => errors.push(`friend pageerror: ${e.message}`));
const t1 = Date.now();
await p2.goto(link);
await p2.getByRole("button", { name: /même draft/i }).click();
await p2.waitForSelector("[data-option]");
log("friend: link → first offer", Date.now() - t1, "ms, clicks: 1");
await pick(4, p2);
await p2.getByRole("button", { name: /accueil/i }).first().click();
await p2.getByText(/reprendre la draft/i).first().click();
await p2.waitForSelector("[data-option]");
await pick(7, p2);
await finish(p2);
await p2.getByRole("button", { name: /^revanche$/i }).filter({ visible: true }).first().waitFor();
await p2.waitForTimeout(600);
await p2.screenshot({ path: `${OUT}/p14-friend-result-fr.png` });
expect(await p2.getByRole("button", { name: /on la refait/i }).count(), "friend can run it back");

await ctx.close();
await ctx2.close();
await browser.close();
console.log(errors.length ? errors.join("\n") : "OK — no errors, all assertions passed");
