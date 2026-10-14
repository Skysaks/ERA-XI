import type { DraftState, PlayerEra, TacticalDimension, TeamRatings } from "@/types";
import { getPlayerEra } from "@/data";
import { createDraft, draftRatings, formationOf, isDraftComplete, lineupPlayers, pickOption, reroll } from "./draft";
import { rateLineup } from "./fit";
import { getFormation } from "./formation";
import { hungarian } from "./autoPlacement";
import { assessSlot } from "./ratings";
import { runSeason } from "./season";
import { expectedSeason } from "./simulation";
import type { Formation } from "@/types";

/**
 * DRAFT LAB — practice/analysis on a finished XI. Nothing here can modify an official
 * result (callers must not record it). Candidate ERA+ feature.
 *
 * Counterfactuals swap ONE decision and keep the other ten players, arranged at their
 * best in the same formation, so the comparison is about the player, not about where the
 * auto-placement happened to put people. Season impact is an ESTIMATE: the difference in
 * expected points (exact expectation of the season model), not a replayed season.
 */

function bestArrangement(players: readonly PlayerEra[], formation: Formation): PlayerEra[] {
  const cost = formation.slots.map((_, r) =>
    formation.slots.map((slot) => {
      const p = players[r];
      if (!p) return 0;
      const a = assessSlot(p, slot.position);
      return -(a.rating + (a.outOfPosition ? 0 : 8));
    }),
  );
  const assignment = hungarian(cost);
  const out = new Array<PlayerEra>(formation.slots.length);
  players.forEach((p, r) => {
    out[assignment[r]!] = p;
  });
  return out;
}

export interface LabOutcome {
  state: DraftState;
  ratings: TeamRatings;
  /** Expected points of the modified XI (estimate). */
  expected: number;
  practice: true;
}

/** The XI with the pick of `round` replaced by another player (Draft Lab "Replace X → Y"). */
export function labSwap(finished: DraftState, round: number, playerEraId: string): LabOutcome {
  if (!isDraftComplete(finished)) throw new Error("Draft Lab needs a complete XI");
  const out = finished.picks[round];
  if (!out) throw new Error("No such round");
  const incoming = getPlayerEra(playerEraId);
  const others = finished.picks.filter((_, i) => i !== round).map((p) => getPlayerEra(p.playerEraId));
  if (others.some((p) => p.playerId === incoming.playerId)) throw new Error("Player already in XI");
  const formation = getFormation(formationOf(finished));
  const arranged = bestArrangement([...others, incoming], formation);
  const lineup = arranged.map((p) => p.id);
  const picks = finished.picks.map((p, i) => (i === round ? { ...p, playerEraId } : p));
  const state: DraftState = { ...finished, picks, lineup };
  const ratings = draftRatings(state);
  return { state, ratings, expected: expectedSeason(ratings, finished.config.seed, finished.config.engineVersion).expected, practice: true };
}

/** Back-compat: replace by option index of that round's shown offer. */
export function labReplace(finished: DraftState, round: number, optionIndex: number): LabOutcome & { result: ReturnType<typeof runSeason> } {
  const offer = offerOfRound(finished, round);
  const id = offer?.options[optionIndex];
  if (!id) throw new Error("No such option");
  const lab = labSwap(finished, round, id);
  return { ...lab, result: runSeason(lab.state) };
}

/** The offer the player actually saw in a round (after a reroll, the reserve). */
export function offerOfRound(state: DraftState, round: number) {
  return state.shown?.[round] ?? (state.rerollRound === round ? state.draw.reserve : state.draw.rounds[round]) ?? null;
}

export interface TurningPoint {
  round: number; // 1-based for display
  took: string;
  instead: string;
  insteadId: string;
  /** Estimated season impact in points (expected points difference, one decimal). */
  pts: number;
  fit: number;
  att: number;
  mid: number;
  def: number;
  /** Largest tactical-dimension changes, e.g. creation +4. */
  dims: { dim: TacticalDimension; delta: number }[];
}

/** Back-compat alias. */
export type Reconsider = TurningPoint;

/**
 * TURNING POINTS — the 1–3 decisions whose best available alternative would have moved the
 * expected season most. Only real alternatives (options shown that round), only gains.
 */
export function turningPoints(finished: DraftState, limit = 3): TurningPoint[] {
  if (!isDraftComplete(finished)) return [];
  const formation = getFormation(formationOf(finished));
  const players = lineupPlayers(finished).filter((p): p is PlayerEra => p !== null);
  const baseR = rateLineup(bestArrangement(players, formation), formation, finished.config.engineVersion);
  const baseE = expectedSeason(baseR, finished.config.seed, finished.config.engineVersion).expected;
  const inXI = new Set(finished.picks.map((p) => getPlayerEra(p.playerEraId).playerId));
  const out: TurningPoint[] = [];
  for (let r = 0; r < finished.picks.length; r++) {
    const offer = offerOfRound(finished, r);
    const took = getPlayerEra(finished.picks[r]!.playerEraId);
    let best: TurningPoint | null = null;
    for (const id of offer?.options ?? []) {
      const alt = getPlayerEra(id);
      if (id === took.id || inXI.has(alt.playerId)) continue;
      const others = finished.picks.filter((_, i) => i !== r).map((p) => getPlayerEra(p.playerEraId));
      const ar = rateLineup(bestArrangement([...others, alt], formation), formation, finished.config.engineVersion);
      const e = expectedSeason(ar, finished.config.seed, finished.config.engineVersion).expected;
      const pts = Math.round((e - baseE) * 10) / 10;
      if (pts <= 0.4 || (best && pts <= best.pts)) continue;
      const dims = (Object.keys(ar.dims) as TacticalDimension[])
        .map((d) => ({ dim: d, delta: ar.dims[d] - baseR.dims[d] }))
        .filter((x) => Math.abs(x.delta) >= 2)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 2);
      best = { round: r + 1, took: took.name, instead: alt.name, insteadId: alt.id, pts, fit: ar.fit - baseR.fit, att: ar.att - baseR.att, mid: ar.mid - baseR.mid, def: ar.def - baseR.def, dims };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.pts - a.pts || a.round - b.round).slice(0, limit);
}

/** Back-compat name used by the V1.4 UI. */
export function worthReconsidering(finished: DraftState, _result?: unknown, limit = 3): TurningPoint[] {
  return turningPoints(finished, limit);
}

/**
 * REPLAY FROM ROUND n (practice): the same draft with the first n−1 decisions kept.
 * The caller must treat the result as practice — it never replaces an official score.
 */
export function replayFrom(finished: DraftState, round: number): DraftState {
  const keep = Math.max(0, Math.min(finished.picks.length, round - 1));
  let s = createDraft(finished.config);
  for (let r = 0; r < keep; r++) {
    if (finished.rerollRound === r) s = reroll(s);
    s = pickOption(s, finished.picks[r]!.optionIndex).state;
  }
  return s;
}

