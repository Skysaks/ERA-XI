import type { ClubEra, DraftOffer, DraftState, Formation, PlayerEra, Position } from "@/types";
import { getClubEra, getPlayerEra, playerEraIdsOf } from "@/data";
import { hungarian, autoPlace } from "./autoPlacement";
import { rateLineup } from "./fit";
import { getFormation } from "./formation";
import { OUT_OF_POSITION_THRESHOLD, POSITION_LINE, positionFamiliarity } from "./positions";
import { assessSlot } from "./ratings";
import { rngFor, type Rng } from "./rng";
import { RULESETS, drawRulesOf, type DrawRules } from "./rulesets";
import { applyEvent } from "./events";
import { ROUNDS } from "./version";

/**
 * DRAFT DIRECTOR (engine v4+).
 *
 * Randomness decides the clubs and eras; the Director decides which four players of that
 * squad are offered, so every round is a real decision and a standard draft never becomes
 * structurally hopeless:
 *   rounds 1–4   free: a superstar, two different jobs, a versatile wildcard — all shared
 *   rounds 5–8   need-aware: the fourth option may answer a slot few later squads can fill
 *   rounds 9–11  protected: the fourth option keeps a credible route to a full XI open
 * It guarantees opportunity, not success: the need option comes from the same squad and is
 * often weaker than the star beside it. Everything is a function of the seed and the SET
 * of players already drafted (not their arrangement), so challenges replay exactly.
 */

export const AWARE_FROM = 4; // 0-based round index → round 5
export const PROTECT_FROM = 8; // round 9

const lineOf = (p: PlayerEra) => POSITION_LINE[p.positions[0] ?? "CM"];
const starWeight = (p: PlayerEra) => Math.pow(Math.max(1, p.overall - 74), 1.6);
const inPosition = (p: PlayerEra, slot: Position) => positionFamiliarity(p.positions, slot) >= OUT_OF_POSITION_THRESHOLD;

/**
 * Engine v5: identity damping. A player with several eras in the dataset (Messi, Cristiano,
 * Maldini…) would otherwise be offered whenever ANY of his eras is drawn, and the same icons
 * would crowd drafts (measured: scripts/diversity-audit.ts). Weight ÷ √(versions) keeps him the
 * likely star of each squad while letting squad-mates take the spotlight more often.
 */
const versionCount = new Map<string, number>();
/** Versions counted inside the engine's own pool: a later dataset never changes an older link's draw. */
export function identityDamping(p: PlayerEra, engineVersion = 99): number {
  const key = `${engineVersion}:${p.playerId}`;
  let n = versionCount.get(key);
  if (n === undefined) {
    n = Math.max(1, playerEraIdsOf(p.playerId).filter((id) => getClubEra(id.slice(0, id.indexOf(":"))).since <= engineVersion).length);
    versionCount.set(key, n);
  }
  return 1 / n;
}
export const dampedFrom = (engineVersion: string) => Number(engineVersion) >= 5;

function pickWeighted(rng: Rng, pool: PlayerEra[], weight: (p: PlayerEra) => number): PlayerEra | null {
  if (!pool.length) return null;
  return pool[rng.weightedIndex(pool.map(weight))] ?? null;
}

/**
 * Structured base offer: superstar temptation, different jobs, a versatile wildcard.
 * `flex` marks the option the adaptive phase may replace (never the star or the keeper).
 */
export function buildDirectedOffer(
  rng: Rng,
  era: ClubEra,
  wantGk: boolean,
  usedPlayers: ReadonlySet<string>,
  choiceCount: number,
  maxOverall: number | null,
  exclude: ReadonlySet<string> | null,
  /** Engine version number when identity damping applies (v5+), else 0. */
  damped = 0,
): { offer: DraftOffer; gotGk: boolean } | null {
  const fame = (p: PlayerEra) => (damped ? identityDamping(p, damped) : 1);
  const pool = era.playerEraIds
    .map(getPlayerEra)
    .filter((p) => !usedPlayers.has(p.playerId) && (maxOverall === null || p.overall <= maxOverall) && (!exclude || !exclude.has(p.playerId)));
  if (pool.length < choiceCount) return null;
  const chosen: PlayerEra[] = [];
  const rest = () => pool.filter((p) => !chosen.includes(p));
  const outfield = () => rest().filter((p) => lineOf(p) !== "GK");

  let gotGk = false;
  if (wantGk) {
    const gk = pickWeighted(rng, rest().filter((p) => lineOf(p) === "GK"), starWeight);
    if (gk) {
      chosen.push(gk);
      gotGk = true;
    }
  }
  // 1. The superstar: the best talent in the squad is usually on the table.
  const stars = outfield().sort((a, b) => b.overall - a.overall).slice(0, 3);
  const star = pickWeighted(rng, stars, (p) => starWeight(p) ** 2 * fame(p));
  if (star) chosen.push(star);
  // 2+. Different jobs: a line not yet offered and a role not yet offered, then versatility.
  while (chosen.length < choiceCount) {
    const lines = new Set(chosen.map(lineOf));
    const roles = new Set(chosen.map((p) => p.roles[0]));
    const isLast = chosen.length === choiceCount - 1;
    let cands = outfield().filter((p) => !lines.has(lineOf(p)));
    if (!cands.length) cands = outfield().filter((p) => !roles.has(p.roles[0]));
    if (!cands.length) cands = outfield();
    if (!cands.length) cands = rest();
    const p = pickWeighted(rng, cands, (x) => starWeight(x) * fame(x) * (x.positions.length >= 2 ? (isLast ? 2 : 1.3) : 1) * (roles.has(x.roles[0]) ? 0.5 : 1));
    if (!p) break;
    chosen.push(p);
  }
  if (chosen.length !== choiceCount) return null;
  // The replaceable option: the last "different job" pick (not the star, not the keeper).
  const flex = chosen[chosen.length - 1]!;
  chosen.sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  return { offer: { clubEraId: era.id, options: chosen.map((p) => p.id), flex: flex.id }, gotGk };
}

// ── SOLVABILITY ─────────────────────────────────────────────────────────────────

export interface Solvability {
  /** Formation slot indices still empty (after the best arrangement of the drafted players). */
  empty: number[];
  /** For each empty slot: how many LATER rounds could still fill it with a natural fit. */
  scarcity: Record<number, number>;
  /** A complete in-position route exists through the remaining rounds (this one included). */
  feasible: boolean;
  /** Slots the best route leaves out of position (0 when feasible). */
  shortfall: number;
  /** slot → round of one credible route. */
  route: Record<number, number>;
}

/** Drafted players placed where they fit best — independent of manual moves. */
export function canonicalArrangement(players: readonly PlayerEra[], formation: Formation): (PlayerEra | null)[] {
  const n = formation.slots.length;
  const cost = formation.slots.map((_, r) =>
    formation.slots.map((slot) => {
      const p = players[r];
      if (!p) return 0;
      return -((inPosition(p, slot.position) ? 100 : 0) + assessSlot(p, slot.position).rating);
    }),
  );
  const assignment = hungarian(cost);
  const out = new Array<PlayerEra | null>(n).fill(null);
  players.forEach((p, r) => {
    out[assignment[r]!] = p;
  });
  return out;
}

/** Max bipartite matching (Kuhn). adj[slot] = providers (picked players "p:i" or rounds "r:n") able to fill it in position. */
function matchSlots(slots: number[], adj: Map<number, string[]>): { size: number; owner: Map<string, number> } {
  const owner = new Map<string, number>();
  const tryAssign = (s: number, seen: Set<string>): boolean => {
    for (const r of adj.get(s) ?? []) {
      if (seen.has(r)) continue;
      seen.add(r);
      const o = owner.get(r);
      if (o === undefined || tryAssign(o, seen)) {
        owner.set(r, s);
        return true;
      }
    }
    return false;
  };
  let size = 0;
  for (const s of slots) if (tryAssign(s, new Set())) size++;
  return { size, owner };
}

interface DirectorContext {
  state: DraftState;
  rules: DrawRules;
  formation: Formation;
  picked: PlayerEra[];
  pickedIds: Set<string>;
  reserved: Set<string>;
}

function contextOf(state: DraftState): DirectorContext {
  const rules = applyEvent(drawRulesOf(RULESETS[state.config.mode]), state.config.event);
  const picked = state.picks.map((p) => getPlayerEra(p.playerEraId));
  const reserved = new Set<string>();
  for (const o of [...state.draw.rounds, state.draw.reserve]) for (const id of o.options) reserved.add(getPlayerEra(id).playerId);
  return { state, rules, formation: getFormation(state.config.formation), picked, pickedIds: new Set(picked.map((p) => p.playerId)), reserved };
}

/** Players of this era the Director may still bring in (not offered elsewhere, not drafted). */
function eraCandidates(ctx: DirectorContext, clubEraId: string, keep: ReadonlySet<string> = new Set()): PlayerEra[] {
  const exclude = ctx.rules.excludePlayers ? new Set(ctx.rules.excludePlayers) : null;
  return getClubEra(clubEraId)
    .playerEraIds.map(getPlayerEra)
    .filter(
      (p) =>
        !ctx.pickedIds.has(p.playerId) &&
        (keep.has(p.playerId) || !ctx.reserved.has(p.playerId)) &&
        (ctx.rules.maxOverall === null || p.overall <= ctx.rules.maxOverall) &&
        (!exclude || !exclude.has(p.playerId)),
    );
}

const adaptive = (ctx: DirectorContext) => Number(ctx.state.config.engineVersion) >= 4 && ctx.rules.offerDirector === "adaptive" && !ctx.rules.positionTargets;

/** What later rounds can still provide, given the drafted SET (not its arrangement). */
export function solvability(state: DraftState): Solvability {
  const ctx = contextOf(state);
  return solvabilityOf(ctx, state.round);
}

function solvabilityOf(ctx: DirectorContext, round: number, hypothetical = false): Solvability {
  const slots = ctx.formation.slots.map((_, i) => i);
  const posOf = (s: number) => ctx.formation.slots[s]!.position;
  // Drafted players first: which slots they can already cover in position.
  const pickedAdj = new Map(slots.map((s) => [s, ctx.picked.flatMap((p, i) => (inPosition(p, posOf(s)) ? [`p:${i}`] : []))]));
  const byPicked = matchSlots(slots, pickedAdj);
  const covered = new Set(byPicked.owner.values());
  const empty = slots.filter((s) => !covered.has(s));
  // Then what the remaining rounds can still provide.
  const rounds: number[] = [];
  for (let r = round; r < ROUNDS; r++) rounds.push(r);
  const isAdaptive = adaptive(ctx);
  const capable = (r: number): PlayerEra[] => {
    const base = !hypothetical && r === round && ctx.state.shown?.[r] ? ctx.state.shown[r]! : ctx.state.draw.rounds[r]!;
    const offered = base.options.map(getPlayerEra).filter((p) => !ctx.pickedIds.has(p.playerId));
    return isAdaptive && r >= AWARE_FROM ? [...offered, ...eraCandidates(ctx, base.clubEraId)] : offered;
  };
  const caps = new Map(rounds.map((r) => [r, capable(r)]));
  const scarcity: Record<number, number> = {};
  const fullAdj = new Map<number, string[]>();
  for (const s of slots) {
    const rs = rounds.filter((r) => caps.get(r)!.some((p) => inPosition(p, posOf(s))));
    if (!covered.has(s)) scarcity[s] = rs.filter((r) => r > round).length;
    fullAdj.set(s, [...(pickedAdj.get(s) ?? []), ...rs.map((r) => `r:${r}`)]);
  }
  // Feasible = all eleven slots can be filled in position by drafted players + remaining rounds.
  const full = matchSlots(slots, fullAdj);
  const route: Record<number, number> = {};
  for (const [who, s] of full.owner) if (who.startsWith("r:")) route[s] = Number(who.slice(2));
  return { empty, scarcity, feasible: full.size === slots.length, shortfall: slots.length - full.size, route };
}

// ── ADAPTIVE RESOLUTION ─────────────────────────────────────────────────────────

/**
 * The offer actually shown this round. Rounds 1–4 (and shared/naive directors) show the
 * base offer. From round 5 the flex option may be replaced by a need or tactical-fit
 * option from the same squad.
 */
export function resolveOffer(state: DraftState, base: DraftOffer): DraftOffer {
  const ctx = contextOf(state);
  const round = state.round;
  if (!adaptive(ctx) || round < AWARE_FROM || !base.flex) return base;
  const fixed = base.options.filter((id) => id !== base.flex).map(getPlayerEra);
  const keep = new Set([getPlayerEra(base.flex).playerId]);
  const cands = eraCandidates(ctx, base.clubEraId, keep).filter((p) => !fixed.some((f) => f.playerId === p.playerId));
  if (!cands.length) return base;
  const rng = rngFor(state.config.seed, "director", state.config.engineVersion, round, state.rerollRound === round ? "r" : "b", [...ctx.pickedIds].sort().join(","));

  const sol = solvabilityOf(ctx, round);
  const covered = (slot: number) => fixed.some((p) => inPosition(p, ctx.formation.slots[slot]!.position));
  const open = sol.empty.filter((s) => !covered(s)).sort((a, b) => sol.scarcity[a]! - sol.scarcity[b]! || a - b);
  const protect = ctx.rules.protectSolvability && round >= PROTECT_FROM;

  let pick: PlayerEra | null = null;
  let reason: "need" | "fit" = "fit";
  // Would taking p still leave a complete in-position route through the later rounds?
  const keepsRoute = (p: PlayerEra) => {
    const next: DirectorContext = { ...ctx, picked: [...ctx.picked, p], pickedIds: new Set([...ctx.pickedIds, p.playerId]) };
    return solvabilityOf(next, round + 1, true).feasible;
  };
  // Protection: if none of the fixed options keeps a route open, the tailored one must.
  if (ctx.rules.protectSolvability && sol.feasible && !fixed.some(keepsRoute)) {
    const saving = cands.filter(keepsRoute);
    const ranked = saving.filter((p) => open.some((s) => inPosition(p, ctx.formation.slots[s]!.position)));
    pick = pickWeighted(rng, ranked.length ? ranked : saving, (p) => (starWeight(p) + 1) * (dampedFrom(ctx.state.config.engineVersion) ? identityDamping(p, Number(ctx.state.config.engineVersion)) : 1));
    if (pick) reason = "need";
  }
  const needSlot = open[0];
  const pressing = needSlot !== undefined && (protect || sol.scarcity[needSlot]! <= 2 || !sol.feasible);
  if (!pick && pressing && needSlot !== undefined) {
    const pos = ctx.formation.slots[needSlot]!.position;
    const fits = cands.filter((p) => inPosition(p, pos));
    const near = fits.length ? fits : cands.filter((p) => positionFamiliarity(p.positions, pos) >= 0.86);
    pick = pickWeighted(rng, near, (p) => (starWeight(p) + 1) * (dampedFrom(ctx.state.config.engineVersion) ? identityDamping(p, Number(ctx.state.config.engineVersion)) : 1));
    if (pick) reason = "need";
  }
  if (!pick) {
    // Tactical fit: the squad member who would lift this XI's FIT the most (canonical arrangement).
    const arranged = canonicalArrangement(ctx.picked, ctx.formation);
    const scored = cands.map((p) => {
      const after = autoPlace(arranged, p, ctx.formation);
      return { p, v: rateLineup(after, ctx.formation, ctx.state.config.engineVersion).fit + p.overall * 0.25 };
    });
    scored.sort((a, b) => b.v - a.v || a.p.id.localeCompare(b.p.id));
    pick = scored[0]?.p ?? null;
  }
  if (!pick) return base;
  const options = [...fixed, pick].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id)).map((p) => p.id);
  return { clubEraId: base.clubEraId, options, flex: base.flex, directed: { playerEraId: pick.id, reason } };
}
