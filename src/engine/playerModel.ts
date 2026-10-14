import type { AttributeKey, PlayerEra, Position, Role } from "@/types";
import { ALL_POSITIONS_ORDER, positionFamiliarity, FAMILIARITY } from "./positions";
import { assessSlot } from "./ratings";
import { SLOT_WEIGHTS, positionScore } from "./weights";
import { buildAttributes } from "@/data/archetypes";

/**
 * PLAYER MODEL — the four layers behind a number, kept separate and explainable:
 *   1. base ability      PlayerEra.overall (era level refined by his attribute profile)
 *   2. position rating   assessSlot(): the same player at another slot (RB 90 · DM 94 · CM 91)
 *   3. role suitability  how well his role fits a slot's job (below)
 *   4. team impact       FIT / pick impacts (engine/fit.ts)
 * Ratings are game-model estimates, not measurements — the UI says so.
 */

export type FamiliarityKind = "natural" | "secondary" | "twin" | "near" | "adjacent" | "sameLine" | "otherLine" | "keeper";

export function familiarityKind(positions: readonly Position[], slot: Position): FamiliarityKind {
  const f = positionFamiliarity(positions, slot);
  if (f === FAMILIARITY.natural) return "natural";
  if (f === FAMILIARITY.secondary) return "secondary";
  if (f === FAMILIARITY.twin) return "twin";
  if (f === FAMILIARITY.near) return "near";
  if (f === FAMILIARITY.adjacent) return "adjacent";
  if (f === FAMILIARITY.sameLine) return "sameLine";
  if (f === FAMILIARITY.goalkeeperMismatch) return "keeper";
  return "otherLine";
}

export interface PositionRating {
  position: Position;
  rating: number;
  kind: FamiliarityKind;
  outOfPosition: boolean;
  /** Rating points lost to unfamiliarity (0 at natural/secondary positions within rounding). */
  penalty: number;
}

/** A player's rating at every position he can reasonably play, best first (natural always included). */
export function positionRatings(p: PlayerEra, limit = 4, among?: readonly Position[]): PositionRating[] {
  const list = (among ?? ALL_POSITIONS_ORDER).filter((pos) => pos !== "GK" || p.positions[0] === "GK");
  const rows = [...new Set(list)].map((position) => {
    const a = assessSlot(p, position);
    const kind = familiarityKind(p.positions, position);
    return { position, rating: Math.round(a.rating), kind, outOfPosition: a.outOfPosition, penalty: Math.round((1 - a.familiarity) * 36) };
  });
  const natural = rows.find((r) => r.kind === "natural");
  const others = rows
    .filter((r) => r.kind !== "natural" && r.kind !== "keeper" && (r.kind === "secondary" || r.kind === "twin" || r.kind === "near") && r.rating >= p.overall - 14)
    .sort((a, b) => b.rating - a.rating);
  return [...(natural ? [natural] : []), ...others].slice(0, limit);
}

/** Role × slot: does the player's job match what the slot asks? 1 = made for it. */
const ROLE_HOME: Record<Role, Position[]> = {
  GK: ["GK"],
  SK: ["GK"],
  BPD: ["CB", "DM"],
  STP: ["CB"],
  FB: ["LB", "RB", "LWB", "RWB"],
  DFB: ["LB", "RB", "CB"],
  WB: ["LWB", "RWB", "LB", "RB", "LM", "RM"],
  ANC: ["DM", "CB"],
  BW: ["DM", "CM"],
  DLP: ["DM", "CM"],
  B2B: ["CM", "DM"],
  PM: ["AM", "CM"],
  WNG: ["LW", "RW", "LM", "RM"],
  IF: ["LW", "RW", "AM"],
  TM: ["ST"],
  PCH: ["ST"],
  F9: ["ST", "AM"],
  CF: ["ST"],
  PRS: ["ST", "LW", "RW"],
};

export function roleSuitability(r: Role, slot: Position): number {
  const home = ROLE_HOME[r];
  const i = home.indexOf(slot);
  if (i === 0) return 1;
  if (i > 0) return 0.9;
  return 0.7;
}

export interface RatingExplanation {
  level: number;
  /** Profile adjustment at his natural position (overall = level + profile). */
  profile: number;
  natural: Position;
  role: Role;
  /** What the natural position asks for, with his value and the typical value for his level. */
  demands: { key: AttributeKey; weight: number; value: number; typical: number }[];
}

/**
 * Why a player is rated what he is: his standing in that era (level) plus how his own
 * attribute profile scores against what his natural position demands, at half weight.
 */
export function explainRating(p: PlayerEra): RatingExplanation {
  const natural = p.positions[0] ?? "CM";
  const r = (p.roles[0] ?? "B2B") as Role;
  const baseline = buildAttributes(p.level, r, {});
  const demands = (Object.entries(SLOT_WEIGHTS[natural]) as [AttributeKey, number][])
    .map(([key, weight]) => ({ key, weight, value: p[key], typical: baseline[key] }))
    .sort((a, b) => b.weight - a.weight);
  void positionScore;
  return { level: p.level, profile: p.overall - p.level, natural, role: r, demands };
}
