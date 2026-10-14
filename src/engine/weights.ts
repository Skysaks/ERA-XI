import type { AttributeKey, Position } from "@/types";

/** What each slot asks of its player. Weights sum to 1. */
export const SLOT_WEIGHTS: Record<Position, Partial<Record<AttributeKey, number>>> = {
  GK: { goalkeeping: 0.8, distribution: 0.2 },
  CB: { defence: 0.45, aerial: 0.2, physical: 0.1, pace: 0.1, buildUp: 0.15 },
  LB: { defence: 0.35, pace: 0.2, progression: 0.2, pressing: 0.1, creation: 0.15 },
  RB: { defence: 0.35, pace: 0.2, progression: 0.2, pressing: 0.1, creation: 0.15 },
  LWB: { defence: 0.25, pace: 0.2, progression: 0.25, creation: 0.2, pressing: 0.1 },
  RWB: { defence: 0.25, pace: 0.2, progression: 0.25, creation: 0.2, pressing: 0.1 },
  DM: { defence: 0.3, pressing: 0.15, retention: 0.2, buildUp: 0.2, progression: 0.15 },
  CM: { retention: 0.2, progression: 0.25, creation: 0.2, pressing: 0.15, defence: 0.1, finishing: 0.1 },
  AM: { creation: 0.4, finishing: 0.2, retention: 0.2, progression: 0.2 },
  LM: { creation: 0.25, pace: 0.2, progression: 0.25, pressing: 0.15, finishing: 0.15 },
  RM: { creation: 0.25, pace: 0.2, progression: 0.25, pressing: 0.15, finishing: 0.15 },
  LW: { finishing: 0.3, creation: 0.25, pace: 0.25, progression: 0.2 },
  RW: { finishing: 0.3, creation: 0.25, pace: 0.25, progression: 0.2 },
  ST: { finishing: 0.5, physical: 0.1, aerial: 0.1, pace: 0.15, creation: 0.15 },
};

/** Weighted attribute score for a position. */
export function positionScore(attrs: Record<AttributeKey, number>, position: Position): number {
  let v = 0;
  for (const [k, w] of Object.entries(SLOT_WEIGHTS[position]) as [AttributeKey, number][]) v += attrs[k] * w;
  return v;
}
