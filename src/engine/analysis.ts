import type { DraftState, SeasonResult, TacticalDimension } from "@/types";
import { DIMENSIONS, DIM_RULES } from "./fit";
import { getFormation } from "./formation";
import { formationOf, lineupPlayers } from "./draft";
import { assessSlot } from "./ratings";
import { enText, msg, type Msg } from "@/i18n";

export const DIM_NAME: Record<TacticalDimension, string> = {
  width: "Width",
  finishing: "Finishing",
  creation: "Creation",
  progression: "Ball progression",
  retention: "Control",
  coverage: "Defensive coverage",
  ballWinning: "Ball winning",
  pace: "Pace",
  aerial: "Aerial presence",
  buildUp: "Build-up",
};

export interface DimReading {
  dim: TacticalDimension;
  name: string;
  value: number;
  threshold: number;
}

export interface PositionalIssue {
  name: string;
  slot: string;
  natural: string;
  ratingDelta: number;
}

export interface AnalysisSummary {
  strengths: DimReading[];
  weaknesses: DimReading[];
  positional: PositionalIssue[];
  explanation: string;
  explanationMsgs: Msg[];
}

/**
 * Executive summary for the Analysis sheet. Every sentence is computed from the XI and
 * the 38 results — no invented narrative.
 */
export function analyseRun(draft: DraftState, result: SeasonResult): AnalysisSummary {
  const t = result.teamRatings;
  const read = (dim: TacticalDimension): DimReading => ({ dim, name: DIM_NAME[dim], value: t.dims[dim], threshold: DIM_RULES[dim].threshold });

  const strengths = DIMENSIONS.map(read)
    .filter((r) => r.value >= r.threshold + 4)
    .sort((a, b) => b.value - b.threshold - (a.value - a.threshold))
    .slice(0, 3);
  const weaknesses = DIMENSIONS.map(read)
    .filter((r) => r.value < r.threshold)
    .sort((a, b) => (b.threshold - b.value) * DIM_RULES[b.dim].weight - (a.threshold - a.value) * DIM_RULES[a.dim].weight)
    .slice(0, 2);

  const formation = getFormation(formationOf(draft));
  const positional: PositionalIssue[] = [];
  lineupPlayers(draft).forEach((p, i) => {
    const slot = formation.slots[i];
    if (!p || !slot) return;
    const a = assessSlot(p, slot.position);
    if (a.outOfPosition) {
      positional.push({ name: p.shortName, slot: slot.position, natural: p.positions[0] ?? "", ratingDelta: Math.round(a.rating - p.overall) });
    }
  });

  const parts: Msg[] = [];
  const s0 = strengths[0];
  const s1 = strengths[1];
  const w0 = weaknesses[0];
  // "@key" params are translated before interpolation (dimension names, positions).
  const dimRef = (d: TacticalDimension) => `@dim.${d}`;
  if (result.format === "gauntlet") {
    const last = result.matchResults[result.matchResults.length - 1];
    if (result.losses && last) parts.push(msg("ax.gauntletOut", { w: result.wins, max: result.maxPoints, opp: last.opponent }));
    else parts.push(msg("ax.gauntletAll", { max: result.maxPoints }));
    parts.push(msg("ax.gauntletGoals", { gf: result.goalsFor, ga: result.goalsAgainst }));
    if (w0 && result.losses) parts.push(msg("ax.gauntletWeak", { dim: dimRef(w0.dim) }));
  } else {
    const dropped = result.maxPoints - result.points;
    const gpg = (result.goalsFor / Math.max(1, result.matchResults.length)).toFixed(1);
    if (s0) parts.push(s1 ? msg("ax.builtOn2", { a: `${dimRef(s0.dim)}|lc`, b: `${dimRef(s1.dim)}|lc` }) : msg("ax.builtOn", { a: `${dimRef(s0.dim)}|lc` }));
    parts.push(msg("ax.scored", { gf: result.goalsFor, gpg, ga: result.goalsAgainst }));
    if (w0) parts.push(msg("ax.gap", { dim: dimRef(w0.dim), dropped, d: result.draws, l: result.losses }));
    else if (dropped > 0) parts.push(msg("ax.noGap", { dropped, d: result.draws, l: result.losses }));
    else parts.push(msg("ax.perfect"));
    const giantLosses = result.matchResults.filter((m) => m.outcome === "L" && m.opponentTier === "giant").length;
    if (result.losses >= 2 && giantLosses >= Math.ceil(result.losses / 2)) parts.push(msg("ax.giants", { g: giantLosses, l: result.losses }));
  }
  if (positional.length) {
    const names = positional.map((p) => `${p.name} (${p.slot})`).join(", ");
    parts.push(msg("ax.oop", { n: positional.length, names }));
  }
  return { strengths, weaknesses, positional, explanation: parts.map(enText).join(" "), explanationMsgs: parts };
}

/**
 * WHY — the one-glance verdict under the score: the XI's standout strength and its main
 * weakness, straight from the tactical dimensions (deterministic, no flavour text).
 * e.g. "ELITE CREATION" · "BUILD-UP WAS YOUR MAIN WEAKNESS".
 */
export function verdictMsgs(result: SeasonResult): Msg[] {
  const d = result.teamRatings.dims;
  const out: Msg[] = [];
  const strong = DIMENSIONS.map((dim) => ({ dim, margin: d[dim] - DIM_RULES[dim].threshold }))
    .filter((x) => x.margin >= 4)
    .sort((a, b) => b.margin - a.margin)[0];
  if (strong) out.push(msg(strong.margin >= 12 ? "why.elite" : "why.strong", { dim: `@dim.${strong.dim}` }));
  // A broken structure explains a season better than any single dimension.
  const tr = result.teamRatings;
  if (tr.fit < 60) {
    out.push(tr.outOfPosition > 0 ? msg("why.fitWeak", { n: tr.outOfPosition }) : msg("why.fitLow"));
    return out;
  }
  const weak = DIMENSIONS.map((dim) => ({ dim, gap: DIM_RULES[dim].threshold - d[dim], w: DIM_RULES[dim].weight }))
    .filter((x) => x.gap > 0)
    .sort((a, b) => b.gap * b.w - a.gap * a.w)[0];
  if (weak) out.push(msg(weak.gap >= 6 ? "why.mainWeakness" : "why.limited", { dim: weak.gap >= 6 ? `@dim.${weak.dim}` : `@dim.${weak.dim}|lc` }));
  return out;
}
