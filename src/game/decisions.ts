import type { DraftState } from "@/types";
import { createDraft, currentOffer, draftRatings, pickOption, previewPick, reroll } from "@/engine";
import { getPlayerEra } from "@/data";

/**
 * YOUR DRAFT — a summary of drafting style built ONLY from this run's decisions (replayed
 * offer by offer). No personality text: every label is a threshold on a measured count.
 */
export type Level = "high" | "medium" | "low";
export type Grade = "excellent" | "strong" | "fair" | "weak";

export interface DecisionSummary {
  /** How often the highest-rated option was taken. */
  starPower: Level;
  /** Final FIT. */
  balance: Grade;
  /** Players out of position in the final XI. */
  discipline: Grade;
  /** Picks that cost FIT or landed out of position. */
  risk: Level;
  /** One sentence, from counts (i18n key + params), or null when nothing stands out. */
  line: { key: string; params: Record<string, number> } | null;
  counts: { starPicks: number; sacrifices: number; costlyStars: number; riskyPicks: number; picks: number };
}

export function decisionSummary(finished: DraftState): DecisionSummary {
  let s = createDraft(finished.config);
  let starPicks = 0, sacrifices = 0, costlyStars = 0, riskyPicks = 0;
  for (const pick of finished.picks) {
    if (finished.rerollRound === s.round) s = reroll(s);
    const offer = currentOffer(s);
    if (!offer) break;
    const ratings = offer.options.map((id) => getPlayerEra(id).overall);
    const top = Math.max(...ratings);
    const topIndex = ratings.indexOf(top);
    const chosen = ratings[pick.optionIndex] ?? 0;
    const mine = previewPick(s, pick.optionIndex);
    const star = s.picks.length === 0 ? null : previewPick(s, topIndex);
    if (chosen === top) {
      starPicks++;
      if (mine && s.picks.length > 0 && (mine.fitDelta <= -4 || mine.outOfPosition)) costlyStars++;
    } else if (mine && star && mine.fitDelta > star.fitDelta && top - chosen >= 2) {
      // Took a lower rating because it served the team better.
      sacrifices++;
    }
    if (mine && (mine.fitDelta <= -4 || mine.outOfPosition)) riskyPicks++;
    s = pickOption(s, pick.optionIndex).state;
  }
  const n = Math.max(1, finished.picks.length);
  const r = draftRatings(finished);
  const starShare = starPicks / n;
  const line =
    sacrifices >= 2
      ? { key: "decide.sacrifices", params: { n: sacrifices } }
      : costlyStars >= 2
        ? { key: "decide.costlyStars", params: { n: costlyStars } }
        : starPicks === finished.picks.length
          ? { key: "decide.allStars", params: { n: starPicks } }
          : riskyPicks === 0 && r.fit >= 92
            ? { key: "decide.clean", params: { n: finished.picks.length } }
            : null;
  return {
    starPower: starShare >= 0.7 ? "high" : starShare >= 0.4 ? "medium" : "low",
    balance: r.fit >= 92 ? "excellent" : r.fit >= 85 ? "strong" : r.fit >= 75 ? "fair" : "weak",
    discipline: r.outOfPosition === 0 ? "excellent" : r.outOfPosition === 1 ? "strong" : r.outOfPosition === 2 ? "fair" : "weak",
    risk: riskyPicks >= 3 ? "high" : riskyPicks >= 1 ? "medium" : "low",
    line,
    counts: { starPicks, sacrifices, costlyStars, riskyPicks, picks: finished.picks.length },
  };
}
