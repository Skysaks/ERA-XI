import type { Line, Position } from "@/types";

export const POSITION_LINE: Record<Position, Line> = {
  GK: "GK",
  CB: "DEF",
  LB: "DEF",
  RB: "DEF",
  LWB: "DEF",
  RWB: "DEF",
  DM: "MID",
  CM: "MID",
  AM: "MID",
  LM: "MID",
  RM: "MID",
  LW: "ATT",
  RW: "ATT",
  ST: "ATT",
};

/** Display order, back to front. */
export const ALL_POSITIONS_ORDER: Position[] = ["GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST"];

export const WIDE_POSITIONS: ReadonlySet<Position> = new Set<Position>([
  "LB",
  "RB",
  "LWB",
  "RWB",
  "LM",
  "RM",
  "LW",
  "RW",
]);

/** Essentially the same job (full-back ↔ wing-back, winger ↔ wide midfielder, CM ↔ DM). */
const TWIN_RAW: Partial<Record<Position, Position[]>> = {
  LB: ["LWB"],
  RB: ["RWB"],
  LW: ["LM"],
  RW: ["RM"],
  CM: ["DM"],
};

/** Positions a player can cover with some adaptation. Symmetric by construction below. */
const NEAR_RAW: Partial<Record<Position, Position[]>> = {
  CB: ["DM"],
  LB: ["LM", "RB"],
  RB: ["RM"],
  LWB: ["LM", "RWB"],
  RWB: ["RM"],
  CM: ["AM", "LM", "RM"],
  AM: ["ST", "LW", "RW"],
  LM: ["RM"],
  LW: ["RW", "ST"],
  RW: ["ST"],
};

function symmetric(raw: Partial<Record<Position, Position[]>>): Record<Position, Set<Position>> {
  const all: Position[] = Object.keys(POSITION_LINE) as Position[];
  const map = {} as Record<Position, Set<Position>>;
  for (const p of all) map[p] = new Set();
  for (const [from, list] of Object.entries(raw) as [Position, Position[]][]) {
    for (const to of list) {
      map[from].add(to);
      map[to].add(from);
    }
  }
  return map;
}

const TWIN = symmetric(TWIN_RAW);
const NEAR = (() => {
  const near = symmetric(NEAR_RAW);
  for (const p of Object.keys(TWIN) as Position[]) for (const q of TWIN[p]) near[p].add(q);
  return near;
})();

export const FAMILIARITY = {
  natural: 1,
  secondary: 0.97,
  twin: 0.94,
  near: 0.86,
  adjacent: 0.74,
  sameLine: 0.66,
  otherLine: 0.5,
  goalkeeperMismatch: 0.15,
} as const;

/** Anything below this is shown as "out of position". */
export const OUT_OF_POSITION_THRESHOLD = 0.9;

/** How familiar a player with `positions` is with playing `slot`. 0–1. */
export function positionFamiliarity(positions: readonly Position[], slot: Position): number {
  const natural = positions[0];
  if (natural === slot) return FAMILIARITY.natural;
  if (positions.includes(slot)) return FAMILIARITY.secondary;
  const isKeeper = natural === "GK";
  if (isKeeper !== (slot === "GK")) return FAMILIARITY.goalkeeperMismatch;
  if (positions.some((p) => TWIN[p].has(slot))) return FAMILIARITY.twin;
  if (positions.some((p) => NEAR[p].has(slot))) return FAMILIARITY.near;
  if (positions.some((p) => [...NEAR[p]].some((q) => NEAR[q].has(slot)))) return FAMILIARITY.adjacent;
  if (positions.some((p) => POSITION_LINE[p] === POSITION_LINE[slot])) return FAMILIARITY.sameLine;
  return FAMILIARITY.otherLine;
}

export function lineOf(position: Position): Line {
  return POSITION_LINE[position];
}
