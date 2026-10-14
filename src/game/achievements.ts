import type { ModeId, SeasonResult } from "@/types";

/**
 * Achievements: few, meaningful, rare. No popups — one quiet line on the result that
 * unlocked it, and a list in the Passport. i18n: ach.<id>.name / ach.<id>.desc
 */
export interface RunFacts {
  mode: ModeId;
  result: SeasonResult;
  rerollUsed: boolean;
  rerollsAvailable: number;
}

export interface AchievementDef {
  id: string;
  test: (r: RunFacts) => boolean;
}

const league = (r: RunFacts) => r.result.format === "league";

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "centurion", test: (r) => league(r) && r.result.points >= 100 },
  { id: "almostperfect", test: (r) => league(r) && r.result.points >= 110 },
  { id: "perfection", test: (r) => league(r) && r.result.points >= 114 },
  { id: "invincible", test: (r) => league(r) && r.result.losses === 0 },
  { id: "purist", test: (r) => league(r) && r.result.points >= 100 && (r.mode === "iq" || r.mode === "mystery") },
  { id: "nosecondchance", test: (r) => league(r) && r.result.points >= 100 && !r.rerollUsed },
  { id: "legendhunter", test: (r) => r.result.format === "gauntlet" && r.result.points >= r.result.maxPoints },
  { id: "cultclassic", test: (r) => league(r) && r.mode === "cult" && r.result.points >= 90 },
];

export function newlyUnlocked(unlocked: Record<string, number>, facts: RunFacts): string[] {
  return ACHIEVEMENTS.filter((a) => !(a.id in unlocked) && a.test(facts)).map((a) => a.id);
}
