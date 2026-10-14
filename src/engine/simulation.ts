import type { MatchResult, OpponentTier, SeasonEvent, SeasonResult, TeamRatings } from "@/types";
import { LEAGUE_COMPOSITION, OPPONENTS, type OpponentDef } from "@/data/opponents";
import { rngFor } from "./rng";
import { integrateForm, poissonOutcome, seasonDistribution, type MatchProbs, type PointsDistribution } from "./expectation";
import { ENGINE_VERSION, SEASON_MATCHES } from "./version";

export interface SimulationInput {
  ratings: TeamRatings;
  seed: string;
  engineVersion: string;
}

/** Pluggable model: a future engine version registers a new one; UI never changes. */
export interface SimulationModel {
  version: string;
  simulate(input: SimulationInput): Omit<SeasonResult, "engineVersion" | "teamRatings" | "format" | "maxPoints">;
}

/**
 * Engine-level calibration between the ERA LEAGUE's authored strengths and team indices.
 * Tuned with scripts/calibrate.ts so a well-balanced elite XI lands around 90 points.
 */
const LEAGUE_OFFSET = 2;

interface Opponent {
  def: OpponentDef;
  attack: number;
  defence: number;
}

/** 19 opponents, stratified by tier so every seed is equally hard; small seeded form swing. */
export function buildLeague(seed: string, engineVersion: string): Opponent[] {
  const rng = rngFor(seed, "league", engineVersion);
  const out: Opponent[] = [];
  for (const tier of Object.keys(LEAGUE_COMPOSITION) as OpponentTier[]) {
    const pool = rng.shuffle(OPPONENTS.filter((x) => x.tier === tier));
    for (const def of pool.slice(0, LEAGUE_COMPOSITION[tier])) {
      out.push({
        def,
        attack: def.attack - LEAGUE_OFFSET + (rng.next() - 0.5) * 2,
        defence: def.defence - LEAGUE_OFFSET + (rng.next() - 0.5) * 2,
      });
    }
  }
  return out;
}

/** Inverse-CDF Poisson draw: a monotone map from u, so a stronger team never draws fewer goals on the same luck. */
export function poissonFromUniform(lambda: number, u: number): number {
  let k = 0;
  let p = Math.exp(-lambda);
  let cdf = p;
  while (u > cdf && k < 15) {
    k++;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}

export function teamIndices(r: TeamRatings): { attack: number; defence: number } {
  const fitPenalty = (100 - r.fit) * 0.1;
  const attack = 0.55 * r.att + 0.3 * r.mid + 0.15 * ((r.dims.finishing + r.dims.creation) / 2) - fitPenalty;
  const defence = 0.45 * r.def + 0.2 * r.gk + 0.2 * r.mid + 0.15 * r.dims.coverage - fitPenalty;
  return { attack, defence };
}

/** Team indices as a given engine version computes them. */
export function teamIndicesFor(r: TeamRatings, engineVersion: string): { attack: number; defence: number } {
  void engineVersion;
  return teamIndices(r);
}

const clampLambda = (x: number) => Math.max(0.08, Math.min(4.2, x));

export const eraLeagueV2: SimulationModel = {
  version: "2",
  simulate({ ratings, seed, engineVersion }) {
    // League and luck depend only on seed + version: creator and challenger face the
    // same fixtures and the same random draws (common random numbers). Only their XI differs.
    const league = buildLeague(seed, engineVersion);
    const orderRng = rngFor(seed, "fixtures", engineVersion);
    const firstHalf = orderRng.shuffle(league.map((_, i) => i));
    const firstHome = new Map(firstHalf.map((o, i) => [o, i % 2 === 0]));
    const fixtures = [
      ...firstHalf.map((o) => ({ o, home: firstHome.get(o) === true })),
      ...orderRng.shuffle(firstHalf).map((o) => ({ o, home: firstHome.get(o) !== true })),
    ];
    const luck = rngFor(seed, "luck", engineVersion);
    const { attack, defence } = teamIndices(ratings);

    const BASE = 1.1;
    const K = 0.072;
    const results: MatchResult[] = [];
    let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;

    fixtures.forEach(({ o, home }, i) => {
      const opp = league[o]!;
      const form = (luck.next() - 0.5) * 3; // day-to-day swing, shared by everyone on this seed
      const lf = clampLambda(BASE * Math.exp(K * (attack + form - opp.defence)) * (home ? 1.1 : 0.92));
      const la = clampLambda(BASE * Math.exp(K * (opp.attack - defence - form)) * (home ? 0.92 : 1.1));
      const goalsFor = poissonFromUniform(lf, luck.next());
      const goalsAgainst = poissonFromUniform(la, luck.next());
      const outcome = goalsFor > goalsAgainst ? "W" : goalsFor === goalsAgainst ? "D" : "L";
      if (outcome === "W") wins++;
      else if (outcome === "D") draws++;
      else losses++;
      gf += goalsFor;
      ga += goalsAgainst;
      results.push({
        matchday: i + 1,
        opponent: opp.def.name,
        opponentId: opp.def.id,
        opponentTier: opp.def.tier,
        home,
        goalsFor,
        goalsAgainst,
        outcome,
      });
    });

    return { wins, draws, losses, goalsFor: gf, goalsAgainst: ga, points: wins * 3 + draws, matchResults: results, events: seasonEvents(results) };
  },
};

/**
 * Exact expectation of the v2/v3 model for this seed's league (fixtures, venues and
 * opponent jitter are seeded; form and goals are integrated). Mirrors eraLeagueV2.
 */
export function expectedSeasonV2(ratings: TeamRatings, seed: string, engineVersion: string): PointsDistribution {
  const league = buildLeague(seed, engineVersion);
  const orderRng = rngFor(seed, "fixtures", engineVersion);
  const firstHalf = orderRng.shuffle(league.map((_, i) => i));
  const firstHome = new Map(firstHalf.map((o, i) => [o, i % 2 === 0]));
  const fixtures = [...firstHalf.map((o) => ({ o, home: firstHome.get(o) === true })), ...firstHalf.map((o) => ({ o, home: firstHome.get(o) !== true }))];
  const { attack, defence } = teamIndices(ratings);
  const matches: MatchProbs[] = fixtures.map(({ o, home }) => {
    const opp = league[o]!;
    return integrateForm(1.5, (form) =>
      poissonOutcome(
        clampLambda(1.1 * Math.exp(0.072 * (attack + form - opp.defence)) * (home ? 1.1 : 0.92)),
        clampLambda(1.1 * Math.exp(0.072 * (opp.attack - defence - form)) * (home ? 0.92 : 1.1)),
      ),
    );
  });
  return seasonDistribution(matches);
}

// ── ENGINE v4 SEASON MODEL ────────────────────────────────────────────────────
/**
 * Calibrated with scripts/calibration*.ts on 100k+ seasons of Draft-Director drafts (see
 * CALIBRATION.md). Same structure as v2 — seeded league, common random numbers, Poisson
 * goals — with three measured changes:
 *   · league scale: historic sides sit 2.5 below a drafted XI's scale (was 2), because
 *     drafted all-star XIs were structurally level with the giants they face;
 *   · steeper strength mapping (K 0.076, was 0.072): better construction is rewarded more;
 *   · elite control: the more elite the XI (average index above 88), the less its superiority
 *     leaks into opponent chances, and the smaller its day-to-day form swing. 114 becomes
 *     possible for a truly elite, coherent XI without becoming routine.
 */
export const V4_PARAMS = { offset: 2.5, K: 0.076, base: 1.1, amp: 1.5, eliteAmp: 0.6, eliteControl: 0.03 } as const;

/** 0 for an ordinary XI, 1 for a team whose average index is 8+ above 88. */
export function eliteness(attack: number, defence: number): number {
  return Math.max(0, Math.min(1, ((attack + defence) / 2 - 88) / 8));
}

function leagueV4(seed: string, engineVersion: string): Opponent[] {
  const shift = V4_PARAMS.offset - LEAGUE_OFFSET;
  return buildLeague(seed, engineVersion).map((o) => ({ ...o, attack: o.attack - shift, defence: o.defence - shift }));
}

function fixturesOf(seed: string, engineVersion: string, n: number): { o: number; home: boolean }[] {
  const orderRng = rngFor(seed, "fixtures", engineVersion);
  const firstHalf = orderRng.shuffle(Array.from({ length: n }, (_, i) => i));
  const firstHome = new Map(firstHalf.map((o, i) => [o, i % 2 === 0]));
  return [...firstHalf.map((o) => ({ o, home: firstHome.get(o) === true })), ...orderRng.shuffle(firstHalf).map((o) => ({ o, home: firstHome.get(o) !== true }))];
}

/** Expected goals for and against in one v4 match, given the day's form. */
export function lambdasV4(attack: number, defence: number, opp: { attack: number; defence: number }, home: boolean, form: number): [number, number] {
  const { K, base, eliteControl } = V4_PARAMS;
  const e = eliteness(attack, defence);
  const edge = Math.max(0, attack + form - opp.defence);
  const lf = Math.max(0.08, Math.min(4.6, base * Math.exp(K * (attack + form - opp.defence)) * (home ? 1.1 : 0.92)));
  const la = Math.max(0.05, Math.min(4.6, base * Math.exp(K * (opp.attack - defence - form) - eliteControl * e * edge) * (home ? 0.92 : 1.1)));
  return [lf, la];
}

const formAmpV4 = (attack: number, defence: number) => V4_PARAMS.amp * (1 - V4_PARAMS.eliteAmp * eliteness(attack, defence));

export const eraLeagueV4: SimulationModel = {
  version: "4",
  simulate({ ratings, seed, engineVersion }) {
    const league = leagueV4(seed, engineVersion);
    const fixtures = fixturesOf(seed, engineVersion, league.length);
    const luck = rngFor(seed, "luck", engineVersion);
    const { attack, defence } = teamIndices(ratings);
    const amp = formAmpV4(attack, defence);
    const results: MatchResult[] = [];
    let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
    fixtures.forEach(({ o, home }, i) => {
      const opp = league[o]!;
      const form = (luck.next() - 0.5) * 2 * amp;
      const [lf, la] = lambdasV4(attack, defence, opp, home, form);
      const goalsFor = poissonFromUniform(lf, luck.next());
      const goalsAgainst = poissonFromUniform(la, luck.next());
      const outcome = goalsFor > goalsAgainst ? "W" : goalsFor === goalsAgainst ? "D" : "L";
      if (outcome === "W") wins++;
      else if (outcome === "D") draws++;
      else losses++;
      gf += goalsFor;
      ga += goalsAgainst;
      results.push({ matchday: i + 1, opponent: opp.def.name, opponentId: opp.def.id, opponentTier: opp.def.tier, home, goalsFor, goalsAgainst, outcome });
    });
    return { wins, draws, losses, goalsFor: gf, goalsAgainst: ga, points: wins * 3 + draws, matchResults: results, events: seasonEvents(results) };
  },
};

/** Exact expectation of the v4 model (same league, fixtures and formulas as eraLeagueV4). */
export function expectedSeasonV4(ratings: TeamRatings, seed: string, engineVersion: string): PointsDistribution {
  const league = leagueV4(seed, engineVersion);
  const fixtures = fixturesOf(seed, engineVersion, league.length);
  const { attack, defence } = teamIndices(ratings);
  const amp = formAmpV4(attack, defence);
  return seasonDistribution(fixtures.map(({ o, home }) => integrateForm(amp, (form) => poissonOutcome(...lambdasV4(attack, defence, league[o]!, home, form)))));
}

// v3 = v2's model on the V1.3 dataset (the draw changed, the league maths did not).
// v5 = v4's season model; only the offers changed (identity damping in the Draft Director).
const MODELS: Record<string, SimulationModel> = { "2": eraLeagueV2, "3": eraLeagueV2, "4": eraLeagueV4, "5": eraLeagueV4, "6": eraLeagueV4, "7": eraLeagueV4 };

export const SUPPORTED_ENGINE_VERSIONS = Object.keys(MODELS);

/** Exact points distribution of a season for this team, seed and engine version. */
export function expectedSeason(ratings: TeamRatings, seed: string, engineVersion: string): PointsDistribution {
  return Number(engineVersion) >= 4 ? expectedSeasonV4(ratings, seed, engineVersion) : expectedSeasonV2(ratings, seed, engineVersion);
}

export function simulateSeason(input: SimulationInput): SeasonResult {
  const model = MODELS[input.engineVersion];
  if (!model) throw new Error(`No simulation model for engine ${input.engineVersion}`);
  const out = model.simulate(input);
  if (out.wins + out.draws + out.losses !== SEASON_MATCHES) throw new Error("Invalid season length");
  if (out.points !== out.wins * 3 + out.draws) throw new Error("Invalid points");
  return { ...out, format: "league", maxPoints: SEASON_MATCHES * 3, engineVersion: input.engineVersion, teamRatings: input.ratings };
}

// ── GAUNTLET ──────────────────────────────────────────────────────────────────
export const GAUNTLET_LENGTH = 10;
/** Weakest to strongest: 2 dangerous, 2 strong, 3 elite, 3 giants (seeded pick inside each tier). */
const GAUNTLET_LADDER: [OpponentTier, number][] = [["dangerous", 2], ["strong", 2], ["elite", 3], ["giant", 3]];

export function gauntletOpponents(seed: string, engineVersion: string): OpponentDef[] {
  const rng = rngFor(seed, "gauntlet", engineVersion);
  const out: OpponentDef[] = [];
  for (const [tier, n] of GAUNTLET_LADDER) {
    const picked = rng.shuffle(OPPONENTS.filter((x) => x.tier === tier)).slice(0, n);
    picked.sort((a, b) => a.attack + a.defence - (b.attack + b.defence));
    out.push(...picked);
  }
  return out;
}

/**
 * Knockout run on neutral ground against legends at full strength (no league offset).
 * Level after 90 → penalties. The run ends at the first defeat; score = legends beaten.
 * Common random numbers again: the luck stream depends only on seed + version.
 */
export function simulateGauntlet(input: SimulationInput): SeasonResult {
  const ladder = gauntletOpponents(input.seed, input.engineVersion);
  const luck = rngFor(input.seed, "gauntlet-luck", input.engineVersion);
  const { attack, defence } = teamIndices(input.ratings);
  const results: MatchResult[] = [];
  let gf = 0, ga = 0, wins = 0, losses = 0;
  for (const [i, opp] of ladder.entries()) {
    const form = (luck.next() - 0.5) * 3;
    const uF = luck.next();
    const uA = luck.next();
    const uP = [luck.next(), luck.next(), luck.next(), luck.next(), luck.next(), luck.next(), luck.next(), luck.next(), luck.next(), luck.next()];
    const lf = clampLambda(1.25 * Math.exp(0.072 * (attack + form - opp.defence)));
    const la = clampLambda(1.25 * Math.exp(0.072 * (opp.attack - defence - form)));
    const goalsFor = poissonFromUniform(lf, uF);
    const goalsAgainst = poissonFromUniform(la, uA);
    let penalties: [number, number] | null = null;
    let won = goalsFor > goalsAgainst;
    if (goalsFor === goalsAgainst) {
      const pYou = Math.min(0.88, Math.max(0.62, 0.74 + (attack - opp.defence) / 220));
      const pThem = Math.min(0.88, Math.max(0.62, 0.74 + (opp.attack - defence) / 220));
      let a = 0, b = 0;
      for (let k = 0; k < 5; k++) {
        if (uP[k * 2]! < pYou) a++;
        if (uP[k * 2 + 1]! < pThem) b++;
      }
      // Sudden death: alternate a fresh draw per kick until one side misses.
      let guard = 0;
      while (a === b && guard++ < 20) {
        const ka = luck.next() < pYou;
        const kb = luck.next() < pThem;
        if (ka) a++;
        if (kb) b++;
      }
      if (a === b) a++;
      penalties = [a, b];
      won = a > b;
    }
    gf += goalsFor;
    ga += goalsAgainst;
    if (won) wins++;
    else losses++;
    results.push({
      matchday: i + 1,
      opponent: opp.name,
      opponentId: opp.id,
      opponentTier: opp.tier,
      home: false,
      goalsFor,
      goalsAgainst,
      outcome: won ? "W" : "L",
      penalties,
    });
    if (!won) break;
  }
  return {
    format: "gauntlet",
    maxPoints: GAUNTLET_LENGTH,
    engineVersion: input.engineVersion,
    teamRatings: input.ratings,
    wins,
    draws: 0,
    losses,
    goalsFor: gf,
    goalsAgainst: ga,
    points: wins,
    matchResults: results,
    events: [],
  };
}

/** Cumulative record after each matchday — for the reveal animation. */
export function cumulativeRecord(result: SeasonResult): { w: number; d: number; l: number; pts: number }[] {
  let w = 0, d = 0, l = 0;
  return result.matchResults.map((m) => {
    if (m.outcome === "W") w++;
    else if (m.outcome === "D") d++;
    else l++;
    return { w, d, l, pts: w * 3 + d };
  });
}

export { ENGINE_VERSION };

const shortOf = (id: string) => OPPONENTS.find((x) => x.id === id)?.short ?? id;

/**
 * Story beats for the reveal. Presentation only, derived from results already computed:
 * first defeat, first win over a giant, a five-goal night, unbeaten and winning streaks.
 */
export function seasonEvents(results: readonly MatchResult[]): SeasonEvent[] {
  const events: SeasonEvent[] = [];
  let unbeaten = 0;
  let winRun = 0;
  let firstLoss = false;
  let statement = false;
  let fiveGoals = false;
  let streakShown = false;
  for (const m of results) {
    const score = `${m.goalsFor}–${m.goalsAgainst}`;
    if (m.outcome === "L") {
      unbeaten = 0;
      winRun = 0;
      if (!firstLoss) {
        firstLoss = true;
        events.push({ matchday: m.matchday, kind: "first_defeat", label: `First defeat · ${score} vs ${shortOf(m.opponentId)}`, params: { score, opp: shortOf(m.opponentId) } });
      }
      continue;
    }
    unbeaten++;
    winRun = m.outcome === "W" ? winRun + 1 : 0;
    if (m.outcome === "W" && !statement && (m.opponentTier === "giant" || (m.opponentTier === "elite" && m.goalsFor - m.goalsAgainst >= 3))) {
      statement = true;
      events.push({ matchday: m.matchday, kind: "statement_win", label: `Statement win · ${score} vs ${shortOf(m.opponentId)}`, params: { score, opp: shortOf(m.opponentId) } });
    } else if (m.goalsFor >= 5 && !fiveGoals) {
      fiveGoals = true;
      events.push({ matchday: m.matchday, kind: "five_goals", label: `Five-goal night · ${score} vs ${shortOf(m.opponentId)}`, params: { score, opp: shortOf(m.opponentId) } });
    }
    if (winRun === 8 && !streakShown) {
      streakShown = true;
      events.push({ matchday: m.matchday, kind: "winning_streak", label: "8 wins in a row" });
    }
    if (unbeaten === 10 || unbeaten === 20 || unbeaten === 30) {
      events.push({ matchday: m.matchday, kind: "unbeaten_run", label: `Unbeaten in ${unbeaten}`, params: { n: unbeaten } });
    }
  }
  const last = results[results.length - 1];
  if (last && results.length === SEASON_MATCHES && results.every((m) => m.outcome !== "L")) {
    events.push({ matchday: last.matchday, kind: "invincible", label: "Invincibles · unbeaten season" });
  }
  // Keep the reveal readable: at most one beat per matchday, max six.
  const seen = new Set<number>();
  return events
    .sort((a, b) => a.matchday - b.matchday)
    .filter((e) => (seen.has(e.matchday) ? false : (seen.add(e.matchday), true)))
    .slice(0, 6);
}

export interface HeadToHead {
  goalsA: number;
  goalsB: number;
  /** Shoot-out, only when level after 90 minutes. */
  penalties: [number, number] | null;
  winner: "A" | "B";
}

/**
 * One match between two drafted XIs on neutral ground — the Duel's secondary event and
 * tie-break. Same model as the season; deterministic from the seed. Symmetric: A vs B
 * mirrors B vs A.
 */
export function simulateHeadToHead(a: TeamRatings, b: TeamRatings, seed: string, engineVersion: string): HeadToHead {
  const rng = rngFor(seed, "h2h", engineVersion);
  const ia = teamIndices(a);
  const ib = teamIndices(b);
  const uA = rng.next();
  const uB = rng.next();
  const la = clampLambda(1.35 * Math.exp(0.072 * (ia.attack - ib.defence)));
  const lb = clampLambda(1.35 * Math.exp(0.072 * (ib.attack - ia.defence)));
  const goalsA = poissonFromUniform(la, uA);
  const goalsB = poissonFromUniform(lb, uB);
  if (goalsA !== goalsB) return { goalsA, goalsB, penalties: null, winner: goalsA > goalsB ? "A" : "B" };
  // Shoot-out: conversion leans slightly on attack quality; sudden death after five each.
  const pA = Math.min(0.9, Math.max(0.6, 0.72 + (ia.attack - ib.defence) / 200));
  const pB = Math.min(0.9, Math.max(0.6, 0.72 + (ib.attack - ia.defence) / 200));
  let sa = 0, sb = 0;
  for (let k = 0; k < 5; k++) {
    if (rng.next() < pA) sa++;
    if (rng.next() < pB) sb++;
  }
  let guard = 0;
  while (sa === sb && guard++ < 30) {
    const ka = rng.next() < pA;
    const kb = rng.next() < pB;
    if (ka) sa++;
    if (kb) sb++;
  }
  if (sa === sb) sa++; // unreachable in practice; keeps the result total
  return { goalsA, goalsB, penalties: [sa, sb], winner: sa > sb ? "A" : "B" };
}
