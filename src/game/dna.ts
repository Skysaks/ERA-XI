import type { DraftState } from "@/types";
import { createDraft, currentOffer, formationOf, getFormation, lineOf, lineupPlayers, pickOption, previewPick, reroll, tacticalStyle, teamSheet } from "@/engine";
import { getClubEra, getPlayerEra } from "@/data";

/**
 * DRAFT DNA — raw per-run features recorded now, profile shown only after enough games.
 * Every number is measured from real decisions; nothing is assigned or guessed.
 */
export interface RunDNA {
  at: number;
  mode: string;
  /** 1 = always took the highest-rated option, 0 = always the lowest. */
  starBias: number;
  /** Share of picks that were the best FIT move available. */
  fitPriority: number;
  attackShare: number;
  defenceShare: number;
  /** Share of creative roles (playmakers, deep playmakers, false nines). */
  creatorShare: number;
  buckets: Record<string, number>;
  clubs: Record<string, number>;
  roles: Record<string, number>;
  rerollRound: number | null;
  outOfPosition: number;
  /** Needs crowd pick data (null until a backend provides it). */
  contrarianRate: number | null;
  /** V1.9 football features of the final XI (absent on older records). */
  formation?: string;
  identity?: string;
  style?: { control: number; vertical: number; width: number; technical: number };
}

export const DNA_MIN_GAMES = 20;
const CREATOR = new Set(["PM", "DLP", "F9"]);
const bump = (m: Record<string, number>, k: string) => ((m[k] = (m[k] ?? 0) + 1), m);

export function runDNA(finished: DraftState, at = Date.now()): RunDNA {
  let s = createDraft(finished.config);
  let star = 0, fitBest = 0, att = 0, def = 0, creator = 0, oop = 0;
  const buckets: Record<string, number> = {};
  const clubs: Record<string, number> = {};
  const roles: Record<string, number> = {};
  for (const pick of finished.picks) {
    if (finished.rerollRound === s.round) s = reroll(s);
    const offer = currentOffer(s)!;
    const ranks = offer.options.map((id) => getPlayerEra(id).overall);
    const chosen = getPlayerEra(pick.playerEraId);
    const better = ranks.filter((o) => o > chosen.overall).length;
    star += offer.options.length > 1 ? 1 - better / (offer.options.length - 1) : 1;
    const previews = offer.options.map((_, i) => previewPick(s, i));
    const mine = previews[pick.optionIndex];
    const bestFit = Math.max(...previews.map((p) => p?.fitDelta ?? -99));
    if (mine && mine.fitDelta >= bestFit) fitBest++;
    if (mine?.outOfPosition) oop++;
    const line = lineOf(chosen.positions[0] ?? "CM");
    if (line === "ATT") att++;
    if (line === "DEF") def++;
    const role = chosen.roles[0] ?? "B2B";
    if (CREATOR.has(role)) creator++;
    bump(roles, role);
    const era = getClubEra(chosen.clubEraId);
    bump(buckets, era.bucket);
    bump(clubs, era.clubId);
    s = pickOption(s, pick.optionIndex).state;
  }
  const n = Math.max(1, finished.picks.length);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    at,
    mode: finished.config.mode,
    starBias: r2(star / n),
    fitPriority: r2(fitBest / n),
    attackShare: r2(att / n),
    defenceShare: r2(def / n),
    creatorShare: r2(creator / n),
    buckets,
    clubs,
    roles,
    rerollRound: finished.rerollRound,
    outOfPosition: oop,
    contrarianRate: null,
    ...footballOf(finished),
  };
}

function footballOf(finished: DraftState): Pick<RunDNA, "formation" | "identity" | "style"> {
  if (!finished.lineup.every(Boolean)) return {};
  const f = getFormation(formationOf(finished));
  const lineup = lineupPlayers(finished);
  return {
    formation: f.id,
    identity: teamSheet(lineup, f, finished.config.engineVersion).identity[0],
    style: tacticalStyle(lineup, f, finished.config.engineVersion),
  };
}

export interface DraftDNA {
  games: number;
  starBias: number;
  fitPriority: number;
  attackBias: number;
  defenceBias: number;
  creatorBias: number;
  topBuckets: string[];
  topClubs: string[];
  topRoles: string[];
  rerollRate: number;
  outOfPositionRisk: number;
  /** Football preferences (needs FOOTBALL_MIN_RUNS runs with a recorded XI style). */
  football: FootballDNA | null;
}

export type Archetype = "galactico" | "architect" | "counter" | "wingPlay" | "warrior" | "tactician" | "pragmatist";

/** Each axis in [−1, 1]: −1 = the first pole, +1 = the second. */
export interface FootballDNA {
  archetype: Archetype;
  axes: { controlVertical: number; possessionTransition: number; technicalPhysical: number; riskBalance: number; starFit: number; widthCentral: number };
  formation: string | null;
  role: string | null;
  bucket: string | null;
  /** Most frequent identity of the XIs (tac.id.*). */
  behaviour: string | null;
}

export const FOOTBALL_MIN_RUNS = 10;
const clamp1 = (x: number) => Math.round(Math.max(-1, Math.min(1, x)) * 100) / 100;
const mostOf = (xs: (string | undefined)[]) => {
  const c: Record<string, number> = {};
  for (const x of xs) if (x) c[x] = (c[x] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

export function footballDNA(runs: readonly RunDNA[], agg: { starBias: number; fitPriority: number; creatorBias: number; outOfPositionRisk: number; topRoles: string[]; topBuckets: string[] }): FootballDNA | null {
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const styled = runs.filter((r) => r.style && num(r.style.control) && num(r.style.vertical) && num(r.style.width) && num(r.style.technical));
  if (styled.length < FOOTBALL_MIN_RUNS) return null;
  const mean = (f: (s: NonNullable<RunDNA["style"]>) => number) => styled.reduce((a, r) => a + f(r.style!), 0) / styled.length;
  const control = mean((s) => s.control);
  const vertical = mean((s) => s.vertical);
  const width = mean((s) => s.width);
  const technical = mean((s) => s.technical);
  const ids = styled.map((r) => r.identity);
  const poss = ids.filter((i) => i === "tac.id.possession").length;
  const trans = ids.filter((i) => i === "tac.id.transition").length;
  const axes = {
    controlVertical: clamp1((vertical - control) / 1.2),
    possessionTransition: clamp1((trans - poss) / Math.max(4, poss + trans)),
    technicalPhysical: clamp1(-technical / 1.2),
    riskBalance: clamp1((agg.fitPriority - 0.5) * 2 - agg.outOfPositionRisk / 3),
    starFit: clamp1((agg.fitPriority - agg.starBias) * 2),
    widthCentral: clamp1(-width / 1.2),
  };
  const archetype: Archetype =
    agg.starBias >= 0.75 && agg.fitPriority < 0.45
      ? "galactico"
      : axes.controlVertical <= -0.3 && agg.creatorBias >= 0.15
        ? "architect"
        : axes.controlVertical >= 0.3
          ? "counter"
          : axes.widthCentral <= -0.4
            ? "wingPlay"
            : axes.technicalPhysical >= 0.4
              ? "warrior"
              : agg.fitPriority >= 0.6 && agg.outOfPositionRisk < 0.5
                ? "tactician"
                : "pragmatist";
  return {
    archetype,
    axes,
    formation: mostOf(styled.map((r) => r.formation)),
    role: agg.topRoles[0] ?? null,
    bucket: agg.topBuckets[0] ?? null,
    behaviour: mostOf(ids),
  };
}

/** Aggregated profile — null below DNA_MIN_GAMES (never a guess from a small sample). */
export function draftDNA(runs: readonly RunDNA[]): DraftDNA | null {
  if (runs.length < DNA_MIN_GAMES) return null;
  const avg = (f: (r: RunDNA) => number) => Math.round((runs.reduce((a, r) => a + f(r), 0) / runs.length) * 100) / 100;
  const top = (f: (r: RunDNA) => Record<string, number>) => {
    const sum: Record<string, number> = {};
    for (const r of runs) for (const [k, v] of Object.entries(f(r))) sum[k] = (sum[k] ?? 0) + v;
    return Object.entries(sum)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);
  };
  const base = {
    games: runs.length,
    starBias: avg((r) => r.starBias),
    fitPriority: avg((r) => r.fitPriority),
    attackBias: avg((r) => r.attackShare),
    defenceBias: avg((r) => r.defenceShare),
    creatorBias: avg((r) => r.creatorShare),
    topBuckets: top((r) => r.buckets),
    topClubs: top((r) => r.clubs),
    topRoles: top((r) => r.roles),
    rerollRate: avg((r) => (r.rerollRound === null ? 0 : 1)),
    outOfPositionRisk: avg((r) => r.outOfPosition),
  };
  return { ...base, football: footballDNA(runs, base) };
}
