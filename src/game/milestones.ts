import type { SeasonResult } from "@/types";

/**
 * SEASON MILESTONES for the 3–4 s reveal. Computed from the finished season (presentation
 * only). At most TWO become prominent — the rarest wins — so the reveal never turns into a
 * stream of badges.
 */
export type MilestoneKind =
  | "perfect" // 38 wins
  | "unbeatenSeason"
  | "hundred" // 100 points reached
  | "perfectHalf" // 19 wins from 19
  | "pbPace" // at the halfway point, on course to beat the personal best
  | "unbeaten10"
  | "goals50"
  | "firstDefeat" // only after a long unbeaten start
  | "pointsDropped"; // first draw after a perfect start (6+ wins)

export interface Milestone {
  kind: MilestoneKind;
  matchday: number;
  params?: Record<string, number>;
}

const PRIORITY: MilestoneKind[] = ["perfect", "unbeatenSeason", "hundred", "perfectHalf", "pbPace", "unbeaten10", "firstDefeat", "pointsDropped", "goals50"];

export function seasonMilestones(result: SeasonResult, personalBest: number | null, max = 2): Milestone[] {
  if (result.format !== "league") return [];
  const all: Milestone[] = [];
  let pts = 0, goals = 0, unbeaten = 0, wins = 0, lost = false, hundred = false, goals50 = false, ten = false, dropped = false;
  const n = result.matchResults.length;
  for (const m of result.matchResults) {
    goals += m.goalsFor;
    if (m.outcome === "W") {
      pts += 3;
      wins++;
    } else if (m.outcome === "D") pts += 1;
    if (m.outcome === "D" && !dropped && wins === m.matchday - 1 && wins >= 6) all.push({ kind: "pointsDropped", matchday: m.matchday, params: { n: wins } });
    if (m.outcome !== "W") dropped = true;
    if (m.outcome === "L") {
      if (!lost && unbeaten >= 12) all.push({ kind: "firstDefeat", matchday: m.matchday, params: { n: unbeaten } });
      lost = true;
      unbeaten = 0;
    } else unbeaten++;
    if (!ten && !lost && unbeaten === 10) {
      ten = true;
      all.push({ kind: "unbeaten10", matchday: m.matchday });
    }
    if (!goals50 && goals >= 50) {
      goals50 = true;
      if (m.matchday <= 26) all.push({ kind: "goals50", matchday: m.matchday, params: { md: m.matchday } });
    }
    if (!hundred && pts >= 100) {
      hundred = true;
      all.push({ kind: "hundred", matchday: m.matchday });
    }
    if (m.matchday === 19) {
      if (wins === 19) all.push({ kind: "perfectHalf", matchday: 19 });
      else if (personalBest !== null && personalBest >= 50 && pts * 2 > personalBest) all.push({ kind: "pbPace", matchday: 19, params: { best: personalBest } });
    }
  }
  const last = n;
  if (n === 38 && result.wins === 38) all.push({ kind: "perfect", matchday: last });
  else if (n === 38 && result.losses === 0) all.push({ kind: "unbeatenSeason", matchday: last });
  const chosen = [...all].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind)).slice(0, max);
  return chosen.sort((a, b) => a.matchday - b.matchday);
}
