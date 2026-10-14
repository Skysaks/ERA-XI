// ERA XI end-to-end suite (production build). Critical flows on a phone viewport; exits 1 on any failure.
//   BASE=http://localhost:3001 OUT=/tmp/shots node e2e/run.mjs
// Flows: first-time solo (micro-guidance, no pre-season prediction, double-tap guard) · formation change ·
// manual repositioning · Daily (official → practice) · Run It Back · challenge create → open (other language) ·
// malformed challenge link · every solo mode entered and completed from the Modes sheet · 320px smoke ·
// V1.7: non-blocking insight, My XIs gallery, Role School, on-demand French/Spanish catalogs.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "/tmp/e2e";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const failures = [];
let at = "";
const mark = (label) => (at = label);
const passed = [];
const phone = (locale = "en-US", width = 390, height = 844) => browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale });

async function step(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const t0 = Date.now();
  try {
    await fn();
    passed.push(`${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failures.push(`${name}: [${at}] ${e.message.split("\n")[0]}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const errorsOf = (page) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return errs;
};
async function pick(page, n) {
  for (let r = 0; r < n; r++) {
    await page.waitForTimeout(300);
    const opts = await page.$$("[data-option]");
    await opts[r % opts.length].click();
  }
}
async function finish(page) {
  await page.getByRole("button", { name: /simulate season|play the season|face the legends|simuler la saison|jouer la saison|affronter les légendes|simular temporada|jugar la temporada|enfrentarse/i }).first().click();
  const skip = page.getByRole("button", { name: /skip|passer|saltar/i });
  if (await skip.count()) await skip.first().click().catch(() => {});
}
const visibleButton = (page, name) => page.getByRole("button", { name }).filter({ visible: true }).first();
async function home(page) {
  await page.getByRole("button", { name: /^home$|^accueil$|^inicio$/i }).first().click();
  await page.locator("[data-cta]").waitFor();
}
/** A new draft in the selected mode: PLAY when it is the primary, else the "Or a new draft" link. */
async function playNew(page) {
  if (await page.locator('[data-cta="play"]').count()) await page.locator('[data-cta="play"]').click();
  else await page.locator('[data-action="secondary-play"]').click();
}

// ── 1. First-time solo ──
let challengeLink = null;
await step("first-time solo: guidance on rounds 1–3 only, no prediction before the season, double tap guarded", async () => {
  const ctx = await phone();
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(BASE);
  await page.getByRole("button", { name: /^play$/i }).click();
  await page.waitForSelector("[data-option]");
  const guide = () => page.locator('[role="note"]').filter({ visible: true }).count();
  assert((await guide()) === 1, "round 1 guidance visible");
  assert(/join your XI automatically/i.test(await page.locator('[role="note"]').first().innerText()), "round 1 text");
  // Double tap on round 1: only one pick may register.
  const first = page.locator("[data-option]").first();
  await first.dblclick();
  await page.waitForTimeout(350);
  const progress = await page.locator('[aria-label^="Round"]').first().innerText();
  assert(/02/.test(progress), `double tap registered twice (${progress.replace(/\s+/g, " ")})`);
  assert((await guide()) === 1, "round 2 guidance visible");
  await pick(page, 2);
  assert((await guide()) === 0, "guidance stops after round 3");
  await pick(page, 8);
  await page.getByRole("button", { name: /simulate season|play the season/i }).waitFor();
  await page.waitForTimeout(500);
  const xiText = await page.locator("main").innerText();
  assert(!/≈|\bpts\b|points/i.test(xiText), "XI Complete must not reveal a points prediction");
  await page.screenshot({ path: `${OUT}/e2e-01-xi.png` });

  // ── formation change ──
  mark("formation change");
  const before = (await page.locator("header").innerText()).match(/\d-\d(-\d)*(-\d)?/)?.[0];
  await page.getByRole("button", { name: /change formation/i }).click();
  await page.waitForTimeout(700);
  const sheetText = await page.locator('[role="dialog"]').innerText();
  assert(!/≈|\bpts\b/i.test(sheetText), "formation sheet must not show points");
  assert((await page.locator('[role="dialog"] li button:not([disabled])').count()) >= 10, "formation options listed");
  await page.locator('[role="dialog"] li button:not([disabled])').nth(2).click();
  await page.waitForTimeout(300);
  const after = (await page.locator("header").innerText()).match(/\d-\d(-\d)*(-\d)?/)?.[0];
  assert(before && after && before !== after, `formation changed (${before} → ${after})`);
  assert(await page.getByRole("button", { name: /undo/i }).count(), "undo offered");

  // ── manual repositioning: select a player, tap a suggested destination ──
  mark("manual repositioning: select a player, tap a suggested destination");
  const slots = page.locator("[data-slot]");
  let moved = false;
  for (let i = 0; i < 11 && !moved; i++) {
    await slots.nth(i).click();
    await page.waitForTimeout(120);
    const dest = page.locator('[aria-label^="Move here"]');
    if (await dest.count()) {
      const name = (await slots.nth(i).innerText()).split("\n").pop();
      await dest.first().click();
      await page.waitForTimeout(200);
      const now = (await slots.nth(i).innerText()).split("\n").pop();
      assert(name !== now, "the tapped player moved");
      moved = true;
    } else {
      await slots.nth(i).click(); // deselect
    }
  }
  assert(moved, "at least one player had a suggested destination");

  mark("simulate");
  await finish(page);
  await visibleButton(page, /^challenge$/i).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/e2e-02-result.png` });
  mark("result");
  // Hierarchy: CHALLENGE above ANALYSE MY XI, both on screen without scrolling.
  const c = await visibleButton(page, /^challenge$/i).boundingBox();
  const a = await visibleButton(page, /analyse my xi/i).boundingBox();
  assert(c && a && c.y < a.y, "Analyse sits below Challenge");
  assert(c.y + c.height <= 844, "Challenge visible without scrolling");
  await visibleButton(page, /analyse my xi/i).click();
  await page.waitForTimeout(900);
  assert(/why \d+ pts/i.test(await page.locator('[role="dialog"]').innerText()), "analysis answers WHY first");
  await page.keyboard.press("Escape");
  await visibleButton(page, /^challenge$/i).click();
  challengeLink = await page.getByLabel("Challenge link").inputValue();
  assert(/\/c\//.test(challengeLink), "challenge link created");
  await page.keyboard.press("Escape");

  // ── Run It Back: same first offer ──
  mark("Run It Back: same first offer");
  await visibleButton(page, /run it back/i).click();
  await page.waitForSelector("[data-option]");
  assert(/01/.test(await page.locator('[aria-label^="Round"]').first().innerText()), "run it back restarts at round 1");
  assert(errs.length === 0, `page errors: ${errs.join(" | ")}`);
  await ctx.close();
});

// ── 2. Daily: official then practice ──
await step("daily: official attempt, then practice", async () => {
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.getByRole("button", { name: /daily xi/i }).first().click();
  await page.waitForSelector("[data-option]");
  await pick(page, 11);
  await finish(page);
  await visibleButton(page, /^challenge$/i).waitFor();
  const tag1 = await page.getByText(/daily · (official|practice)/i).first().innerText();
  await visibleButton(page, /run it back/i).click();
  await page.waitForSelector("[data-option]");
  await pick(page, 11);
  await finish(page);
  await visibleButton(page, /^challenge$/i).waitFor();
  const tag2 = await page.getByText(/daily · (official|practice)/i).first().innerText();
  assert(/official/i.test(tag1) && /practice/i.test(tag2), `official then practice (${tag1} → ${tag2})`);
  await ctx.close();
});

// ── 3. Challenge opened by a friend (French) ──
await step("challenge: open link in French, play the same draft, see the comparison", async () => {
  assert(challengeLink, "needs the link from flow 1");
  const ctx = await phone("fr-FR");
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(challengeLink);
  await page.getByRole("button", { name: /même draft/i }).click();
  await page.waitForSelector("[data-option]");
  await pick(page, 11);
  await finish(page);
  await page.getByRole("button", { name: /^revanche$/i }).filter({ visible: true }).first().waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/e2e-03-rival-fr.png` });
  assert(errs.length === 0, `page errors: ${errs.join(" | ")}`);
  await ctx.close();
});

// ── 4. Malformed challenge link: never a blank screen ──
await step("malformed challenge link falls back to Home with a notice", async () => {
  const ctx = await phone();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/c/${"x".repeat(40)}`);
  await page.getByRole("button", { name: /^play$/i }).waitFor({ timeout: 8000 });
  assert(await page.locator('[role="status"]').count(), "a notice explains the link could not be read");
  await ctx.close();
});

// ── 5. Every solo mode from the Modes sheet ──
const MODES = ["Classic", "Football IQ", "Nations", "World XI", "One Club", "One League", "Era Lock", "Champions", "Cult XI", "Gauntlet", "Blitz", "No Reroll", "Position Draft", "Mystery XI"];
{
  const ctx = await phone();
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(BASE);
  await page.getByRole("button", { name: /^play$/i }).waitFor();
  for (const label of MODES) {
    await step(`mode: ${label} can be entered and completed`, async () => {
      await page.getByRole("button", { name: /^modes/i }).click();
      await page.waitForTimeout(300);
      await page.locator('[role="dialog"] button').filter({ hasText: new RegExp(`^${label}`, "i") }).first().click();
      await page.waitForTimeout(200);
      if (await page.locator('[role="dialog"]').count()) await page.keyboard.press("Escape");
      await playNew(page);
      await page.waitForSelector("[data-option]");
      await pick(page, 11);
      await finish(page);
      await visibleButton(page, /^challenge$|rematch/i).waitFor({ timeout: 15000 });
      await home(page);
    });
  }
  await step("weekly event from the Modes sheet", async () => {
    await page.getByRole("button", { name: /^modes/i }).click();
    await page.waitForTimeout(300);
    await page.locator('[role="dialog"] button').filter({ hasText: /^play$/i }).first().click();
    await page.waitForSelector("[data-option]");
    await pick(page, 11);
    await finish(page);
    await visibleButton(page, /^challenge$/i).waitFor({ timeout: 15000 });
    await home(page);
  });
  await step("modes: no page errors across all modes", async () => assert(errs.length === 0, errs.join(" | ")));
  await ctx.close();
}

// ── 6. Small phone smoke (320×568, Spanish) ──
await step("320×568 Spanish: play a full run, CTA always reachable", async () => {
  const ctx = await phone("es-ES", 320, 568);
  const page = await ctx.newPage();
  await page.goto(BASE);
  const play = page.getByRole("button", { name: /^jugar$/i });
  const box = await play.boundingBox();
  assert(box && box.y + box.height <= 568, "PLAY above the fold at 320×568");
  await play.click();
  await page.waitForSelector("[data-option]");
  await pick(page, 11);
  await page.waitForTimeout(400);
  const sim = page.getByRole("button", { name: /simular|jugar la temporada/i }).first();
  const sb = await sim.boundingBox();
  assert(sb && sb.y + sb.height <= 568, "SIMULATE reachable without scrolling");
  await page.screenshot({ path: `${OUT}/e2e-04-xi-es-320.png` });
  await finish(page);
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "no horizontal overflow on the result");
  await page.screenshot({ path: `${OUT}/e2e-05-result-es-320.png` });
  await ctx.close();
});

// ── 7. V1.7: knowledge insight never blocks, gallery keeps the XI, Role School, lazy language ──
await step("knowledge: post-pick insight is non-blocking; My XIs keeps the run; Role School opens", async () => {
  const ctx = await phone();
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(BASE);
  // A returning player: guidance (rounds 1–3 of the first run) would otherwise hide insights.
  await page.getByRole("button", { name: /^play$/i }).click();
  await page.waitForSelector("[data-option]");
  await pick(page, 11);
  await finish(page);
  await visibleButton(page, /^challenge$/i).waitFor();
  await home(page);
  await playNew(page);
  await page.waitForSelector("[data-option]");
  mark("insights");
  let insights = 0;
  for (let r = 0; r < 11; r++) {
    const round = await page.locator('[aria-label^="Round"]').first().innerText();
    await page.locator("[data-option]").first().click();
    await page.waitForTimeout(250);
    if (await page.locator('[role="status"]').filter({ visible: true }).filter({ hasText: /\S/ }).count()) insights++;
    if (r < 10) {
      // The next round is live at once: its options are clickable while the insight shows.
      await page.waitForFunction((prev) => document.querySelector('[aria-label^="Round"]')?.textContent !== prev, round, { timeout: 2000 });
      assert(await page.locator("[data-option]").first().isEnabled(), `round ${r + 2} options enabled under the insight`);
    }
  }
  assert(insights >= 1, "at least one post-pick insight in a Standard draft");
  await finish(page);
  await visibleButton(page, /^challenge$/i).waitFor();
  await home(page);
  mark("gallery");
  await page.locator('[data-action="myera"]').click();
  await page.locator('[role="dialog"] button').filter({ hasText: /my xis/i }).first().click();
  await page.waitForTimeout(600);
  const gallery = await page.locator('[role="dialog"]').last().innerText();
  if (process.env.DEBUG) console.log(gallery);
  assert(/recent\s*2/i.test(gallery), "both completed XIs are in Recent");
  assert(/bests appear once/i.test(gallery), "no category best before enough history");
  await page.locator('[role="dialog"]').last().getByRole("tab", { name: /recent/i }).or(page.locator('[role="dialog"]').last().getByRole("button", { name: /^recent/i })).first().click();
  await page.waitForTimeout(300);
  assert(/\b\d{1,3}\b/.test(await page.locator('[role="dialog"]').last().innerText()), "recent XIs listed with their score");
  await page.screenshot({ path: `${OUT}/e2e-06-gallery.png` });
  await page.keyboard.press("Escape");
  mark("role school");
  await page.locator('[data-action="myera"]').click();
  await page.locator('[role="dialog"] button').filter({ hasText: /passport/i }).first().click();
  await page.getByRole("button", { name: /role school/i }).click();
  await page.getByText(/what it does/i).first().waitFor({ timeout: 5000 });
  await page.screenshot({ path: `${OUT}/e2e-07-school.png` });
  assert(errs.length === 0, `page errors: ${errs.join(" | ")}`);
  await ctx.close();
});

// ── 8. V1.8: Help Center (from ? and in context) and the single contextual primary action ──
await step("help & contextual CTA: ? opens Help, Modes deep-links into it, one primary action by situation", async () => {
  const ctx = await phone();
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(BASE);
  assert((await page.locator("[data-cta]").getAttribute("data-cta")) === "play", "first visit: PLAY");
  await page.locator('[data-action="help"]').click();
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.getByText(/how to play/i).first().waitFor({ timeout: 5000 });
  assert((await dlg.locator("li button").count()) >= 11, "11 Help sections");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^modes/i }).click();
  await page.getByRole("button", { name: /which mode to play/i }).click();
  await page.waitForTimeout(800);
  const helpText = await page.locator('[role="dialog"]').last().innerText();
  assert(/game modes/i.test(helpText) && /classic is the core game/i.test(helpText), "Help opened at Game modes, expanded");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  mark("contextual CTA");
  for (let g = 0; g < 2; g++) {
    await page.waitForTimeout(300);
    await playNew(page);
    await page.waitForSelector("[data-option]");
    await pick(page, 11);
    await finish(page);
    await visibleButton(page, /^challenge$/i).waitFor();
    await home(page);
  }
  const cta = await page.locator("[data-cta]").getAttribute("data-cta");
  assert(cta === "daily", `after 2 games the primary becomes today's Daily (got ${cta})`);
  assert((await page.locator('[data-cta]').count()) === 1, "exactly one primary action");
  assert(await page.locator('[data-action="secondary-play"]').count(), "a new draft stays one tap away");
  assert(await page.locator('[data-action="myera"]').count(), "My ERA appears after the first game");
  await page.screenshot({ path: `${OUT}/e2e-08-home-returning.png` });
  assert(errs.length === 0, `page errors: ${errs.join(" | ")}`);
  await ctx.close();
});

await step("language: French and Spanish load on demand, first paint already in the right language", async () => {
  const ctx = await phone("fr-FR");
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  const english = [];
  await page.goto(BASE);
  await page.getByRole("button", { name: /^jouer$/i }).waitFor();
  // The very first rendered Home was French (no English flash).
  if (await page.getByRole("button", { name: /^play$/i }).count()) english.push("play");
  assert(english.length === 0, "no English UI while French loads");
  await page.getByRole("button", { name: /^español$/i }).first().click();
  await page.getByRole("button", { name: /^jugar$/i }).waitFor({ timeout: 5000 });
  assert(errs.length === 0, `page errors: ${errs.join(" | ")}`);
  await ctx.close();
});

await browser.close();
for (const p of passed) console.log("✓", p);
for (const f of failures) console.log("✗", f);
console.log(`\n${passed.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
