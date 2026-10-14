import type { DraftState, SeasonResult } from "@/types";
import { draftRatings, isDraftComplete } from "./draft";
import { simulateGauntlet, simulateSeason } from "./simulation";
import { RULESETS } from "./rulesets";

/** Complete XI → full season (or gauntlet run, per ruleset). Pure and deterministic. */
export function runSeason(state: DraftState): SeasonResult {
  if (!isDraftComplete(state)) throw new Error("Draft not complete");
  const input = { ratings: draftRatings(state), seed: state.config.seed, engineVersion: state.config.engineVersion };
  return RULESETS[state.config.mode].seasonType === "gauntlet" ? simulateGauntlet(input) : simulateSeason(input);
}
