// V1.3: every new mode end to end, language switch, home from anywhere, old links, shared draft.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/shots";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const log = (...a) => console.log(...a);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await page.goto(BASE);
await page.waitForSelector("text=Compose un XI impossible");
log("auto French:", true);
await shot("01-home-fr");

async function pickMode(label, choice) {
  await page.getByRole("button", { name: /plus de modes|modes/i }).first().click();
  await page.getByRole("button", { name: new RegExp(label, "i") }).first().click();
  if (choice) await page.getByRole("button", { name: choice, exact: true }).click();
  // Choice modes keep the sheet open; close it.
  const close = page.getByRole("button", { name: "Fermer" }).last();
  if (await close.isVisible().catch(() => false)) await close.click();
}
async function draftAll(name, { waitBlitz = false } = {}) {
  await page.getByRole("button", { name: /^jouer$/i }).click();
  await page.waitForSelector("[data-option]");
  await shot(`${name}-draft`);
  for (let r = 0; r < 11; r++) {
    if (waitBlitz && r === 2) {
      await page.waitForTimeout(8700); // let the clock run out once
      continue;
    }
    await page.waitForSelector("[data-option]:not([disabled])", { timeout: 12000 }).catch(() => null);
    if (await page.locator("text=/Simuler|Affronter/").count()) break;
    await page.waitForTimeout(300);
    const opts = await page.$$("[data-option]");
    let c = opts[0];
    for (const o of opts) if (!/hors poste/i.test(await o.innerText())) { c = o; break; }
    await c.click();
  }
  await page.waitForSelector("text=/Simuler la saison|Affronter les légendes/", { timeout: 15000 });
  await shot(`${name}-xi`);
  await page.getByRole("button", { name: /Simuler la saison|Affronter les légendes/ }).click();
  await page.getByRole("button", { name: /passer/i }).click();
  await page.getByRole("button", { name: /^Défier$/ }).filter({ visible: true }).first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(`${name}-result`);
  const score = await page.locator("[aria-label*='sur']").first().getAttribute("aria-label");
  log(name, "→", score);
  await page.getByRole("button", { name: "Accueil" }).first().click();
  await page.waitForSelector("text=Compose un XI impossible");
}

await pickMode("Sélections"); await draftAll("02-nations");
await pickMode("Un seul club", "Barcelona"); await draftAll("03-oneclub");
await pickMode("Une époque", "Années 80"); await draftAll("04-eralock80s");
await pickMode("Champions"); await draftAll("05-champions");
await pickMode("XI culte"); await draftAll("06-cult");
await pickMode("Draft par poste"); await draftAll("07-position");
await pickMode("XI mystère"); await draftAll("08-mystery");
await pickMode("Défi des légendes"); await draftAll("09-gauntlet");
await pickMode("Blitz"); await draftAll("10-blitz", { waitBlitz: true });

// Home mid-draft: solo autosaves, no confirmation (V1.4).
await page.getByRole("button", { name: "Classique", exact: true }).first().click();
await page.getByRole("button", { name: /^jouer$/i }).click();
await page.waitForSelector("[data-option]");
await page.locator("[data-option]").first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Accueil" }).first().click();
await page.waitForSelector("text=Compose un XI impossible");
await page.waitForSelector("text=/Reprendre la draft/i");
await shot("11-resume");
log("home without confirm, resume offered: true");

// Switch to Spanish (Settings → Expérience once the player has games), then English.
await page.getByRole("button", { name: "Réglages" }).click();
await page.locator("summary", { hasText: /expérience/i }).click();
await page.getByRole("button", { name: "Español" }).click();
await page.getByRole("button", { name: "Cerrar" }).last().click();
await page.waitForSelector("text=Crea un XI imposible");
await shot("12-home-es");
await page.getByRole("button", { name: /más modos|modos/i }).first().click();
await page.waitForTimeout(300);
await shot("13-modes-es");
await page.getByRole("button", { name: "Cerrar" }).last().click();
await page.reload();
await page.waitForSelector("text=Crea un XI imposible");
log("language persisted after reload: es");

// Old V1.2 link still plays (English UI).
await page.getByRole("button", { name: "Ajustes" }).click();
await page.locator("summary", { hasText: /experiencia/i }).click();
await page.getByRole("button", { name: "English" }).click();
await page.getByRole("button", { name: "Close" }).last().click();
await page.goto(`${BASE}/c/eyJ2IjoxLCJlIjoiMiIsInMiOiJyenAyZmpocCIsIm0iOiJjbGFzc2ljIiwiZiI6IjQzMyIsInNjIjo5MiwicCI6IjAxMDEyMTAwMzAyIiwiciI6LTEsImwiOiI1ODM5NDc2MjEwYSIsIm4iOiJGbG9yaWFuIn0`);
await page.waitForSelector("text=/Florian scored/i");
log("v1.2 link accepted:", await page.locator("text=92").count() > 0);
await shot("14-old-link");

// Shared Draft practice vs bot (English).
await page.getByRole("button", { name: "Home" }).first().click();
await page.getByRole("button", { name: /^(live duel|duel|duelo)$/i }).first().click();
await page.getByRole("button", { name: /Shared Draft ›/ }).click();
await page.getByRole("button", { name: /create shared draft/i }).click();
await page.getByRole("button", { name: /practice vs bot/i }).click();
let sawTheirTurn = false, sawTaken = false;
for (let r = 0; r < 11; r++) {
  for (let i = 0; i < 80; i++) {
    if (await page.locator("text=/picks first/i").count()) sawTheirTurn = true;
    if (await page.locator("text=/Your pick · /i").count()) sawTaken = true;
    if (await page.locator("[data-option]:not([disabled])").count()) break;
    await page.waitForTimeout(100);
  }
  if (r === 1) await shot("15-shared-turn");
  const free = page.locator("[data-option]:not([disabled])");
  await free.first().click();
  await page.waitForTimeout(150);
}
await page.waitForSelector("text=/You win|wins/i", { timeout: 20000 });
await shot("16-shared-result");
log("shared: their-turn shown", sawTheirTurn, "| taken shown", sawTaken);
log("errors:", errors.length ? errors : "none");
await browser.close();
