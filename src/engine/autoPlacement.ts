import type { Formation, PlayerEra } from "@/types";
import { assessSlot } from "./ratings";

/** Bonus for staying put, so players only move when it's clearly better. */
const STICKINESS = 2.5;
/** Mild preference for the position a player is known for, all else being close. */
const NATURAL_BONUS = 1.5;

/**
 * Hungarian algorithm (Kuhn–Munkres), minimisation on a square matrix.
 * Returns assignment[row] = column. O(n³); n = 11 here.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]! > 0) assignment[p[j]! - 1] = j - 1;
  return assignment;
}

/**
 * Place `incoming` into the lineup, re-seating existing players only when the
 * team is materially better for it. Considers natural/secondary positions,
 * vacant slots and out-of-position cost via slot ratings.
 */
export function autoPlace(
  lineup: readonly (PlayerEra | null)[],
  incoming: PlayerEra,
  formation: Formation,
): (PlayerEra | null)[] {
  const n = formation.slots.length;
  const current: { player: PlayerEra; slot: number }[] = [];
  lineup.forEach((p, i) => {
    if (p) current.push({ player: p, slot: i });
  });
  const people: { player: PlayerEra; slot: number | null }[] = [...current, { player: incoming, slot: null }];
  if (people.length > n) throw new Error("Lineup already full");

  const cost: number[][] = [];
  for (let r = 0; r < n; r++) {
    const row: number[] = [];
    const person = people[r];
    for (let c = 0; c < n; c++) {
      if (!person) {
        row.push(0);
        continue;
      }
      const slot = formation.slots[c]!;
      const value =
        assessSlot(person.player, slot.position).rating +
        (person.slot === c ? STICKINESS : 0) +
        (person.player.positions[0] === slot.position ? NATURAL_BONUS : 0);
      row.push(-value);
    }
    cost.push(row);
  }
  const assignment = hungarian(cost);
  const next: (PlayerEra | null)[] = new Array<PlayerEra | null>(n).fill(null);
  people.forEach((person, r) => {
    const col = assignment[r];
    if (col === undefined || col < 0) throw new Error("Assignment failed");
    next[col] = person.player;
  });
  return next;
}

/** Best possible arrangement of a full XI, ignoring current placement. */
export function optimalArrangement(players: readonly PlayerEra[], formation: Formation): PlayerEra[] {
  const n = formation.slots.length;
  const cost = formation.slots.map((_, r) =>
    formation.slots.map((slot) => {
      const p = players[r];
      return p ? -assessSlot(p, slot.position).rating : 0;
    }),
  );
  const assignment = hungarian(cost);
  const out = new Array<PlayerEra>(n);
  players.forEach((p, r) => {
    out[assignment[r]!] = p;
  });
  return out;
}
