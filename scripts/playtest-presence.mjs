// Standalone build + a fake presence channel (BroadcastChannel) standing in for the artifact
// `room` capability: two tabs play a Live Duel with commit–reveal, no server.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
const OUT = process.env.OUT ?? "/tmp/shots";
const html = fs.readFileSync("dist/era-xi.html");
const server = http.createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); }).listen(4100);
const FAKE = `
window.claude = { use: async (name) => (name === "room" && !window.__noRoom ? fakeRoom() : null) };
function fakeRoom() {
  if (window.__room) return window.__room;
  const me = Math.random().toString(36).slice(2);
  const bc = new BroadcastChannel("fake-room");
  const peers = new Map(); let mine = {}; const handlers = new Set();
  const build = () => Object.freeze([{ peer: me, isMe: true, sameTab: true, presence: mine, updatedAt: 0, by: null, kind: "viewer", guest: false },
    ...[...peers].map(([p, v]) => ({ peer: p, isMe: false, sameTab: false, presence: v.presence, updatedAt: v.at, by: null, kind: "viewer", guest: false }))]);
  let snap = build();
  const fire = () => { snap = build(); handlers.forEach((h) => h({ peers: snap })); };
  bc.onmessage = (e) => { const d = e.data; if (d.bye) peers.delete(d.peer); else { peers.set(d.peer, { presence: d.presence, at: Date.now() }); if (d.hello) bc.postMessage({ peer: me, presence: mine }); } fire(); };
  setInterval(() => { if (window.__offline) return; bc.postMessage({ peer: me, presence: mine }); const now = Date.now(); let ch = false; for (const [p, v] of peers) if (now - v.at > 3000) { peers.delete(p); ch = true; } if (ch) fire(); }, 1000);
  bc.postMessage({ peer: me, presence: mine, hello: true });
  addEventListener("pagehide", () => bc.postMessage({ peer: me, bye: true }));
  window.__room = { presence: async (patch) => { mine = { ...mine, ...patch }; for (const k in patch) if (patch[k] === null) delete mine[k]; if (!window.__offline) bc.postMessage({ peer: me, presence: mine }); fire(); },
    peers: () => snap, onPeers: (h) => { handlers.add(h); queueMicrotask(() => h({ peers: snap })); return () => handlers.delete(h); } };
  return window.__room;
}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(FAKE);
const errors = [];
const A = await ctx.newPage(), B = await ctx.newPage();
for (const [n, p] of [["A", A], ["B", B]]) { p.on("pageerror", (e) => errors.push(`[${n}] ${e.message}`)); p.on("console", (m) => { if (m.type() === "error") errors.push(`[${n}] ${m.text()}`); }); }
await A.goto("http://localhost:4100/");
await A.getByRole("button", { name: /^(live duel|duel|duelo)$/i }).first().click();
await A.getByLabel("Your name (optional)").fill("Florian");
await A.getByRole("button", { name: /create duel/i }).click();
await A.waitForSelector("text=Room code");
const link = await A.getByLabel("Room link").inputValue();
console.log("presence link", link);
await B.goto(link);
await B.getByLabel("Your name (optional)").fill("Anthony");
await B.getByRole("button", { name: /^play$/i }).click();
await B.waitForSelector("[data-option]", { timeout: 8000 });
await A.waitForSelector("[data-option]", { timeout: 8000 });
const offers = async (p) => (await p.$$eval("[data-option] [data-name]", (els) => els.map((e) => e.textContent).sort().join("|")));
let same = true;
for (let r = 0; r < 11; r++) {
  await A.waitForSelector("[data-option]:not([disabled])", { timeout: 8000 });
  await B.waitForSelector("[data-option]:not([disabled])", { timeout: 8000 });
  same &&= (await offers(A)) === (await offers(B));
  await A.locator("[data-option]").nth(r % 4).click();
  await B.waitForSelector("text=/Florian locked in/i", { timeout: 6000 });
  // A's option must not be derivable from B's page before B locks: no tag, no reveal.
  if (r === 0) console.log("B sees A's choice before locking:", await B.locator("text=/^Florian$/").count() > 0);
  if (r === 4) { await B.reload(); await B.waitForSelector("[data-option]", { timeout: 10000 }); console.log("B reloaded mid-duel: seat kept"); }
  await B.locator("[data-option]").nth((r + 2) % 4).click();
  await A.waitForSelector("text=/→/", { timeout: 6000 });
  if (r === 2) { await A.waitForTimeout(150); await A.screenshot({ path: `${OUT}/presence-01-reveal.png` }); }
}
console.log("identical offers:", same);
await A.waitForSelector("text=/You win|wins/i", { timeout: 10000 });
await B.waitForSelector("text=/You win|wins/i", { timeout: 10000 });
const v = async (p) => (await p.locator("text=/^(You win|.* wins)$/i").first().textContent());
console.log("verdicts:", await v(A), "|", await v(B));
const sc = async (p) => (await p.$$eval("main .tnum", (e) => e.slice(0, 2).map((x) => x.textContent)));
console.log("scores A", await sc(A), "B", await sc(B));
await A.screenshot({ path: `${OUT}/presence-02-result.png` });
// No room capability → practice fallback.
const C = await ctx.newPage();
await C.addInitScript("window.__noRoom = true");
await C.goto("http://localhost:4100/");
await C.getByRole("button", { name: /^(live duel|duel|duelo)$/i }).first().click();
await C.getByRole("button", { name: /create duel/i }).click();
await C.waitForSelector("text=Live rooms are off here", { timeout: 5000 });
await C.screenshot({ path: `${OUT}/presence-03-fallback.png` });
console.log("fallback offered:", await C.getByRole("button", { name: /practice vs bot/i }).count());
console.log("errors:", errors.length ? errors : "none");
await browser.close(); server.close();
