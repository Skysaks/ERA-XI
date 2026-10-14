// Mobile audit (16 screens incl. My ERA and Help): every key screen at every target viewport. Measures (not eyeballs):
// horizontal overflow, primary CTA inside the first viewport, touch targets < 44px,
// text < 11px, clipped (truncated) names, sheets taller than the viewport.
// BASE (default http://localhost:3001, a production build) · OUT screenshots dir.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "/tmp/shots";
const LANG = process.env.LANG_CODE ?? "en-US";
const VIEWPORTS = (process.env.VIEWPORTS ?? "320x568,360x800,375x812,390x844,393x852,430x932,844x390").split(",").map((v) => v.split("x").map(Number));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const report = [];

async function audit(page, screen, vp, cta) {
  const r = await page.evaluate((ctaSel) => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const visible = (el) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none" && b.bottom > 0 && b.top < vh * 3;
    };
    const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 28);
    const dialog = document.querySelector('[role="dialog"]');
    const scope = dialog ?? document;
    const targets = [...scope.querySelectorAll("button, a[href], input, select, summary, [role=switch]")].filter(visible);
    const small = targets
      .filter((el) => !(el.tagName === "INPUT" && el.classList.contains("sr-only")))
      .map((el) => {
        const b = el.getBoundingClientRect();
        // The hit area counts padding/negative margins; a label wrapping a switch counts as the target.
        const host = el.closest("label") ?? el;
        const hb = host.getBoundingClientRect();
        return { el, w: Math.max(b.width, hb.width), h: Math.max(b.height, hb.height) };
      })
      .filter((x) => x.w < 44 || x.h < 44)
      .map((x) => `${label(x.el)} ${Math.round(x.w)}×${Math.round(x.h)}`);
    const tiny = new Set();
    for (const el of scope.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!hasText) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11) tiny.add(`${fs}px "${el.textContent.trim().slice(0, 24)}"`);
    }
    const clipped = [...scope.querySelectorAll(".truncate")].filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim().slice(0, 30));
    const overflowX = document.documentElement.scrollWidth > vw + 1;
    let ctaVisible = null;
    if (ctaSel) {
      const el = [...document.querySelectorAll(ctaSel)].find((e) => e.getBoundingClientRect().height > 0);
      if (el) {
        const b = el.getBoundingClientRect();
        ctaVisible = b.bottom <= vh + 1 && b.top >= 0;
      } else ctaVisible = "missing";
    }
    const sheet = dialog?.querySelector(":scope > div:last-child");
    const sheetTooTall = sheet ? sheet.getBoundingClientRect().height > vh + 1 : false;
    return { overflowX, ctaVisible, small: small.slice(0, 12), smallCount: small.length, tiny: [...tiny].slice(0, 8), tinyCount: tiny.size, clipped: clipped.slice(0, 8), sheetTooTall };
  }, cta);
  await page.screenshot({ path: `${OUT}/m-${vp[0]}x${vp[1]}-${screen}.png` });
  report.push({ vp: `${vp[0]}x${vp[1]}`, screen, ...r });
}

for (const vp of VIEWPORTS) {
  const [w, h] = vp;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: LANG });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.push({ vp: `${w}x${h}`, screen: "error", error: e.message }));
  await page.goto(BASE);
  await page.locator("main").first().waitFor();
  await page.waitForTimeout(400);
  await audit(page, "01-home-new", vp, "main button.bg-volt");
  await page.locator("main button.bg-volt").first().click(); // PLAY
  await page.waitForSelector("[data-option]");
  await page.waitForTimeout(450);
  await audit(page, "02-draft-r1", vp, "[data-option]:last-of-type");
  const lastOption = async () => page.evaluate(() => { const o = [...document.querySelectorAll("[data-option]")].pop(); const b = o.getBoundingClientRect(); return b.bottom <= window.innerHeight + 1; });
  const r1Last = await lastOption();
  for (let r = 0; r < 5; r++) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[r % 3].click(); }
  await page.waitForTimeout(350);
  await audit(page, "03-draft-r6", vp, null);
  const r6Last = await lastOption();
  report[report.length - 1].allOptionsVisible = r6Last;
  report[report.length - 2].allOptionsVisible = r1Last;
  for (let r = 5; r < 11; r++) { await page.waitForTimeout(300); await (await page.$$("[data-option]"))[r % 4].click(); }
  await page.waitForTimeout(500);
  await audit(page, "04-xi", vp, "main button.bg-volt");
  await page.locator('[data-action="formation"]').click(); // FORMATION →
  await page.waitForTimeout(700);
  await audit(page, "05-formation", vp, null);
  await page.keyboard.press("Escape");
  await page.locator("main button.bg-volt").last().click(); // simulate
  await page.waitForTimeout(1200);
  await audit(page, "06-sim", vp, null);
  const skip = page.locator("main button").filter({ hasText: /→/ }).last();
  if (await skip.count()) await skip.click().catch(() => {});
  await page.waitForTimeout(1600);
  await audit(page, "07-result", vp, "main button.bg-volt");
  await page.locator('[data-action="analyse"]').click();
  await page.waitForTimeout(900);
  await audit(page, "08-analysis", vp, null);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  // Challenge link → a friend on the same phone size
  await page.locator("main button.bg-volt").filter({ visible: true }).first().click();
  await page.waitForTimeout(500);
  await audit(page, "10-share", vp, null);
  const link = await page.locator("input[readonly]").first().inputValue().catch(() => null);
  await page.keyboard.press("Escape");
  await page.locator("main header button").first().click(); // home
  await page.waitForTimeout(500);
  await audit(page, "09-home-returning", vp, "main button.bg-volt");
  await page.locator('[data-action="modes"]').click();
  await page.waitForTimeout(400);
  await audit(page, "11-modes", vp, null);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.locator('[data-action="myera"]').click();
  await page.waitForTimeout(900);
  await audit(page, "15-myera", vp, null);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.locator('[data-action="help"]').click();
  await page.waitForTimeout(900);
  await audit(page, "16-help", vp, null);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  if (link) {
    const ctx2 = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: LANG });
    const p2 = await ctx2.newPage();
    p2.on("pageerror", (e) => report.push({ vp: `${w}x${h}`, screen: "error-friend", error: e.message }));
    await p2.goto(link);
    await p2.waitForTimeout(700);
    await audit(p2, "12-challenge-intro", vp, "main button.bg-volt");
    await p2.locator("main button.bg-volt").filter({ visible: true }).first().click();
    await p2.waitForSelector("[data-option]");
    await p2.waitForTimeout(300);
    await p2.locator('[data-action="inspect"]').first().click();
    await p2.waitForTimeout(400);
    await audit(p2, "13-inspect", vp, null);
    await p2.keyboard.press("Escape");
    for (let r = 0; r < 11; r++) { await p2.waitForTimeout(300); await (await p2.$$("[data-option]"))[r % 3].click(); }
    await p2.waitForTimeout(500);
    await p2.locator("main button.bg-volt").last().click();
    await p2.waitForTimeout(1000);
    const sk = p2.locator("main button").filter({ hasText: /→/ }).last();
    if (await sk.count()) await sk.click().catch(() => {});
    await p2.waitForTimeout(1600);
    await audit(p2, "14-rival-result", vp, "main button.bg-volt");
    await ctx2.close();
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/audit.json`, JSON.stringify(report, null, 1));
for (const r of report) {
  if (r.error) { console.log(r.vp, "ERROR", r.error); continue; }
  const flags = [];
  if (r.overflowX) flags.push("OVERFLOW-X");
  if (r.ctaVisible === false) flags.push("CTA-BELOW-FOLD");
  if (r.allOptionsVisible === false) flags.push("OPTIONS-BELOW-FOLD");
  if (r.sheetTooTall) flags.push("SHEET-TOO-TALL");
  if (r.clipped.length) flags.push(`clipped:${r.clipped.join("|")}`);
  console.log(`${r.vp.padEnd(8)} ${r.screen.padEnd(18)} small:${r.smallCount} tiny:${r.tinyCount} ${flags.join(" ")}`);
}
