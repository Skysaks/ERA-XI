import type { DraftState, Formation, FormationId, PlayerEra, TeamRatings } from "@/types";
import { getPlayerEra } from "@/data";
import { hungarian } from "./autoPlacement";
import { DIM_RULES, DIMENSIONS, rateLineup } from "./fit";
import { ALL_FORMATION_IDS, getFormation } from "./formation";
import { assessSlot } from "./ratings";
import { formationOf, isDraftComplete, lineupPlayers } from "./draft";
import { RULESETS } from "./rulesets";
import { expectedSeason, teamIndicesFor } from "./simulation";

/**
 * TACTICS — what the player can still decide once the XI is drafted: the formation and
 * who plays where. Nothing here changes a lineup without the player applying it.
 */

/** Rulesets decide whether the formation can change after the draft (engine v4+ only). */
export function formationFlexible(state: DraftState): boolean {
  return Number(state.config.engineVersion) >= 4 && RULESETS[state.config.mode].formationPolicy === "flexible";
}

const strength = (r: TeamRatings, engineVersion: string) => {
  const t = teamIndicesFor(r, engineVersion);
  return t.attack + t.defence;
};

/**
 * Best arrangement of these players in a formation: Hungarian assignment on slot ratings
 * (keepers and naturals first), then pairwise swaps while team strength (which includes
 * FIT and role relationships) improves.
 */
export function arrangeFor(players: readonly PlayerEra[], formation: Formation, engineVersion: string): PlayerEra[] {
  const n = formation.slots.length;
  const cost = formation.slots.map((_, r) =>
    formation.slots.map((slot) => {
      const p = players[r];
      if (!p) return 0;
      const a = assessSlot(p, slot.position);
      return -(a.rating + (a.outOfPosition ? 0 : 8) + (p.positions[0] === slot.position ? 1.5 : 0));
    }),
  );
  const assignment = hungarian(cost);
  let best: PlayerEra[] = new Array<PlayerEra>(n);
  players.forEach((p, r) => {
    best[assignment[r]!] = p;
  });
  let bestV = strength(rateLineup(best, formation, engineVersion), engineVersion);
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const cand = best.slice();
        [cand[a], cand[b]] = [cand[b]!, cand[a]!];
        const v = strength(rateLineup(cand, formation, engineVersion), engineVersion);
        if (v > bestV + 1e-9) {
          best = cand;
          bestV = v;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

export interface Projection {
  formation: FormationId;
  fit: number;
  overall: number;
  outOfPosition: number;
  /** Expected league points for this seed (exact expectation, not a simulation). */
  expected: number;
  lineup: (string | null)[];
}

function project(state: DraftState, formation: FormationId, lineup: (PlayerEra | null)[]): Projection {
  const r = rateLineup(lineup, getFormation(formation), state.config.engineVersion);
  return {
    formation,
    fit: r.fit,
    overall: r.overall,
    outOfPosition: r.outOfPosition,
    expected: expectedSeason(r, state.config.seed, state.config.engineVersion).expected,
    lineup: lineup.map((p) => p?.id ?? null),
  };
}

/** The XI as it stands. */
export function currentProjection(state: DraftState): Projection {
  return project(state, formationOf(state), lineupPlayers(state));
}

/** The formations the ruleset lets this XI switch to (the current one only when locked). */
export function formationIdsFor(state: DraftState): readonly FormationId[] {
  return formationFlexible(state) ? ALL_FORMATION_IDS : [formationOf(state)];
}

/** This XI arranged optimally in one formation. UIs call it one formation per task so the main thread never blocks. */
export function formationProjection(state: DraftState, id: FormationId): Projection {
  const players = lineupPlayers(state).filter((p): p is PlayerEra => p !== null);
  return project(state, id, arrangeFor(players, getFormation(id), state.config.engineVersion));
}

/** Every formation the ruleset allows, each with the XI arranged optimally in it. */
export function formationOptions(state: DraftState): Projection[] {
  if (!isDraftComplete(state)) return [];
  return formationIdsFor(state).map((id) => formationProjection(state, id));
}

/** Switch formation; the XI is re-arranged optimally (the player can still swap after). */
export function changeFormation(state: DraftState, formation: FormationId): DraftState {
  if (formation === formationOf(state)) return state;
  if (!formationFlexible(state)) throw new Error("Formation is locked in this mode");
  const players = lineupPlayers(state).filter((p): p is PlayerEra => p !== null);
  const arranged = arrangeFor(players, getFormation(formation), state.config.engineVersion);
  return { ...state, formation, lineup: arranged.map((p) => p.id) };
}

/** Apply a projection (from formationOptions / optimiseXI) as the XI. */
export function applyProjection(state: DraftState, p: Projection): DraftState {
  const draftFormation = state.config.formation;
  return { ...state, formation: p.formation === draftFormation && !state.formation ? undefined : p.formation, lineup: p.lineup.slice() };
}

export interface HealthIssue {
  /** i18n key: health.<id> */
  id: "oop" | "noKeeper" | "critical" | "transition" | "width";
  params?: Record<string, string | number>;
  severity: "severe" | "warning";
}

/** Structural problems worth a look before the season. Informational only. */
export function healthCheck(state: DraftState): HealthIssue[] {
  if (!isDraftComplete(state)) return [];
  const formation = getFormation(formationOf(state));
  const players = lineupPlayers(state);
  const r = rateLineup(players, formation, state.config.engineVersion);
  const out: HealthIssue[] = [];
  const gkIndex = formation.slots.findIndex((s) => s.position === "GK");
  if (players[gkIndex]?.positions[0] !== "GK") out.push({ id: "noKeeper", severity: "severe" });
  if (r.outOfPosition >= 2) out.push({ id: "oop", params: { n: r.outOfPosition }, severity: r.outOfPosition >= 3 ? "severe" : "warning" });
  const worst = DIMENSIONS.map((d) => ({ d, gap: DIM_RULES[d].threshold - r.dims[d] })).sort((a, b) => b.gap - a.gap)[0];
  if (worst && worst.gap >= 10) out.push({ id: "critical", params: { dim: `@dim.${worst.d}|lc` }, severity: worst.gap >= 16 ? "severe" : "warning" });
  if (r.synergies?.some((s) => s.id === "transition")) out.push({ id: "transition", severity: "warning" });
  return out;
}

export interface Optimisation {
  before: Projection;
  after: Projection;
  /** True when the best option uses another formation. */
  formationChanged: boolean;
}

/**
 * OPTIMISE XI: the best arrangement (and, where the ruleset allows, formation) for these
 * eleven players, by expected points. Returns null when nothing meaningful improves.
 */
export function optimiseXI(state: DraftState): Optimisation | null {
  if (!isDraftComplete(state)) return null;
  return optimiseFrom(currentProjection(state), formationOptions(state));
}

/** OPTIMISE XI from projections already computed (see formationProjection). */
export function optimiseFrom(before: Projection, options: readonly Projection[]): Optimisation | null {
  const best = options.reduce((a, b) => (b.expected > a.expected ? b : a), before);
  if (best.expected - before.expected < 0.5 && best.fit <= before.fit) return null;
  return { before, after: best, formationChanged: best.formation !== before.formation };
}

export function playerById(id: string | null): PlayerEra | null {
  return id ? getPlayerEra(id) : null;
}

/**
 * While a player is selected on the pitch: his rating at every slot he can reasonably play
 * (natural, secondary or close positions). Other slots stay tappable — penalties apply and
 * are shown on the pitch — but they are not suggested.
 */
export function destinationsFor(state: DraftState, from: number): Record<number, { rating: number; oop: boolean }> {
  const formation = getFormation(formationOf(state));
  const id = state.lineup[from];
  if (!id) return {};
  const p = getPlayerEra(id);
  const out: Record<number, { rating: number; oop: boolean }> = {};
  formation.slots.forEach((slot, i) => {
    if (i === from) return;
    const a = assessSlot(p, slot.position);
    if (a.familiarity < 0.74) return;
    out[i] = { rating: Math.round(a.rating), oop: a.outOfPosition };
  });
  return out;
}
