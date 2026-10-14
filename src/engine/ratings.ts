import type { AttributeKey, Formation, FormationSlot, PlayerEra, Position } from "@/types";
import { SLOT_WEIGHTS, positionScore } from "./weights";

export { SLOT_WEIGHTS };
import { OUT_OF_POSITION_THRESHOLD, positionFamiliarity } from "./positions";

/** Rating points lost per unit of unfamiliarity. */
export const OOP_RATING_COST = 36;

export interface SlotAssessment {
  familiarity: number;
  rating: number;
  outOfPosition: boolean;
}

/**
 * Player × slot. At his natural position a player rates exactly his displayed overall;
 * elsewhere the rating moves with how his attributes suit that slot (half weight) and
 * drops with unfamiliarity. So "→ LW −6" means exactly that.
 */
export function assessSlot(player: PlayerEra, slot: Position): SlotAssessment {
  const familiarity = positionFamiliarity(player.positions, slot);
  const natural = player.positions[0] ?? slot;
  const suit = natural === slot ? 0 : 0.5 * (positionScore(player, slot) - positionScore(player, natural));
  const raw = player.overall + suit - (1 - familiarity) * OOP_RATING_COST;
  return {
    familiarity,
    rating: Math.max(1, Math.min(99, raw)),
    outOfPosition: familiarity < OUT_OF_POSITION_THRESHOLD,
  };
}

/** A filled slot with everything downstream modules need. */
export interface LineupEntry {
  index: number;
  slot: FormationSlot;
  player: PlayerEra;
  assessment: SlotAssessment;
}

export function lineupEntries(
  lineup: readonly (PlayerEra | null)[],
  formation: Formation,
): LineupEntry[] {
  const out: LineupEntry[] = [];
  formation.slots.forEach((slot, index) => {
    const player = lineup[index];
    if (player) out.push({ index, slot, player, assessment: assessSlot(player, slot.position) });
  });
  return out;
}

/** Attribute as it actually shows up on the pitch: unfamiliar roles dull everything. */
export function effective(entry: LineupEntry, key: AttributeKey): number {
  return entry.player[key] * (0.6 + 0.4 * entry.assessment.familiarity);
}
