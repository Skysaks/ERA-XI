/**
 * Dedicated social card (not a screenshot). Drawn on canvas, 1080×1350 (4:5),
 * with self-hosted fonts so it looks identical everywhere.
 */
import type { Formation, PlayerEra, SeasonResult } from "@/types";
type T = (key: string, params?: Record<string, string | number>) => string;

const INK = "#080A09";
const CHALK = "#F1EFE7";
const VOLT = "#D9FF43";
const PITCH = "#123328";
const ASH = "#777C78";
const LOSS = "#FF625C";
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = '"Inter Variable", Inter, system-ui, sans-serif';

export interface ChallengeCardInput {
  kind: "challenge";
  /** Translator for every word drawn on the card. */
  t: T;
  name: string | null;
  result: SeasonResult;
  formation: Formation;
  modeLabel: string;
  players: readonly (PlayerEra | null)[];
}

export interface RivalCardInput {
  kind: "rival";
  t: T;
  rivalName: string;
  yours: number;
  theirs: number;
  outcome: "win" | "loss" | "draw";
  decisive: { yours: string; theirs: string; pts: number } | null;
  result: SeasonResult;
  formation: Formation;
  modeLabel: string;
  players: readonly (PlayerEra | null)[];
}

export type CardInput = ChallengeCardInput | RivalCardInput;

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load(`800 100px ${DISPLAY}`),
      document.fonts.load(`700 100px ${DISPLAY}`),
      document.fonts.load(`600 24px ${SANS}`),
    ]);
  } catch {
    /* fall back to system fonts */
  }
}

/** The ERA XI mark (see EraMark): centre circle, kick-off spot, halfway line stopping short. */
function mark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  const u = size / 24;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.7 * u;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 10.5 * u, cy);
  ctx.lineTo(cx - 6.3 * u, cy);
  ctx.moveTo(cx + 6.3 * u, cy);
  ctx.lineTo(cx + 10.5 * u, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 5.6 * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 1.55 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  mark(ctx, x + size * 0.34, y - size * 0.36, size * 0.72, "rgba(241,239,231,0.75)");
  ctx.font = `800 ${size}px ${DISPLAY}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = CHALK;
  ctx.fillText("ERA XI", x + size * 0.8, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPitch(ctx: CanvasRenderingContext2D, input: CardInput, x: number, y: number, w: number, h: number) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = PITCH;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = "rgba(241,239,231,0.16)";
  ctx.lineWidth = 2;
  const m = 18;
  ctx.strokeRect(x + m, y + m, w - 2 * m, h - 2 * m);
  ctx.beginPath();
  ctx.moveTo(x + m, y + h / 2);
  ctx.lineTo(x + w - m, y + h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, h * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  const bw = w * 0.5;
  const bh = h * 0.14;
  ctx.strokeRect(x + (w - bw) / 2, y + h - m - bh, bw, bh);
  ctx.strokeRect(x + (w - bw) / 2, y + m, bw, bh);

  input.formation.slots.forEach((slot, i) => {
    const p = input.players[i];
    if (!p) return;
    const cx = x + w * (slot.x * 0.86 + 7) / 100;
    const cy = y + h * (100 - (slot.y * 0.84 + 8)) / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = CHALK;
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `700 22px ${DISPLAY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.overall), cx, cy + 1);
    ctx.font = `600 19px ${SANS}`;
    const label = p.shortName.length > 12 ? `${p.shortName.slice(0, 11)}…` : p.shortName;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(8,10,9,0.6)";
    roundRect(ctx, cx - tw / 2 - 6, cy + 25, tw + 12, 26, 5);
    ctx.fill();
    ctx.fillStyle = CHALK;
    ctx.fillText(label, cx, cy + 38.5);
  });
  ctx.restore();
}

export async function renderShareCard(input: CardInput): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);

  const pad = 72;
  wordmark(ctx, pad, 128, 84);
  ctx.font = `700 30px ${DISPLAY}`;
  ctx.fillStyle = ASH;
  ctx.textAlign = "right";
  ctx.fillText(`${input.formation.label} · ${input.modeLabel.toUpperCase()}`, W - pad, 118);

  const r = input.result;
  const tr = input.t;
  const gauntlet = r.format === "gauntlet";
  ctx.textAlign = "left";

  // 114 / 114 — a unique, quiet state: a thin volt frame and PERFECT ERA. Rarity is the effect.
  const perfect = !gauntlet && r.points === r.maxPoints && r.maxPoints === 114;
  if (perfect) {
    ctx.strokeStyle = VOLT;
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, W - 48, H - 48);
  }
  if (input.kind === "challenge") {
    ctx.font = `700 34px ${DISPLAY}`;
    ctx.fillStyle = perfect ? VOLT : ASH;
    ctx.fillText(perfect ? tr("card.perfect") : input.name ? tr("card.nameXI", { name: input.name.toUpperCase() }) : tr("card.myXI"), pad, 232);
    ctx.font = `800 260px ${DISPLAY}`;
    ctx.fillStyle = perfect ? VOLT : CHALK;
    ctx.fillText(String(r.points), pad - 8, 460);
    const sw = ctx.measureText(String(r.points)).width;
    ctx.font = `800 64px ${DISPLAY}`;
    ctx.fillStyle = CHALK;
    const unit = gauntlet ? tr("card.legends") : tr("card.pts");
    ctx.fillText(unit, pad + sw + 4, 460);
    const pw = ctx.measureText(`${unit} `).width;
    ctx.font = `800 96px ${DISPLAY}`;
    ctx.fillStyle = ASH;
    ctx.fillText(`/ ${r.maxPoints}`, pad + sw + 8 + pw, 460);
  } else {
    const who = input.rivalName.toUpperCase();
    const head = input.outcome === "win" ? tr("card.iBeat", { name: who }) : input.outcome === "loss" ? tr("card.wins", { name: who }) : tr("card.deadHeat");
    ctx.font = `800 64px ${DISPLAY}`;
    ctx.fillStyle = input.outcome === "loss" ? LOSS : VOLT;
    ctx.fillText(head, pad, 250);
    ctx.font = `800 220px ${DISPLAY}`;
    ctx.fillStyle = CHALK;
    const a = String(input.yours);
    ctx.fillText(a, pad - 6, 460);
    const aw = ctx.measureText(a).width;
    ctx.fillStyle = ASH;
    ctx.fillText(` – ${input.theirs}`, pad - 6 + aw, 460);
  }

  ctx.font = `700 60px ${DISPLAY}`;
  ctx.fillStyle = CHALK;
  ctx.fillText(gauntlet ? `${r.wins} / ${r.maxPoints}` : tr("stat.record", { w: r.wins, d: r.draws, l: r.losses }), pad, 548);
  const t = r.teamRatings;
  if (input.kind === "rival" && input.decisive) {
    const d = input.decisive;
    ctx.font = `700 30px ${DISPLAY}`;
    ctx.fillStyle = VOLT;
    const sign = d.pts > 0 ? `+${d.pts}` : `${d.pts}`;
    ctx.fillText(tr("card.decisive", { yours: d.yours.toUpperCase(), theirs: d.theirs.toUpperCase(), pts: sign }), pad, 604);
  } else {
    ctx.font = `600 26px ${SANS}`;
    ctx.fillStyle = ASH;
    ctx.fillText(tr("card.ratings", { t: t.overall, a: t.att, m: t.mid, d: t.def, f: t.fit }), pad, 600);
  }

  drawPitch(ctx, input, pad, 648, W - 2 * pad, 480);

  ctx.font = `800 70px ${DISPLAY}`;
  ctx.fillStyle = VOLT;
  ctx.fillText(input.kind === "challenge" ? tr("card.canYou") : tr("card.yourTurn"), pad, 1228);
  ctx.font = `500 28px ${SANS}`;
  ctx.fillStyle = ASH;
  ctx.fillText(tr("card.tagline"), pad, 1276);
  mark(ctx, W - pad - 24, 1266, 48, ASH);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
