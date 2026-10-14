/**
 * ERA+ — future optional tier. Entitlements unlock depth AROUND the game loop, never
 * strength inside it. There is deliberately no entitlement that changes a rating, a
 * draw, a reroll count, a score or the simulation (see FORBIDDEN).
 */
export type Entitlement =
  | "career_analytics"
  | "unlimited_history"
  | "draft_lab"
  | "tactical_reports"
  | "daily_archive"
  | "custom_rulesets"
  | "private_rooms_plus"
  | "rival_analytics"
  | "premium_cards"
  | "profile_customisation"
  | "ad_free";

export const ERA_PLUS: readonly Entitlement[] = [
  "career_analytics",
  "unlimited_history",
  "draft_lab",
  "tactical_reports",
  "daily_archive",
  "custom_rulesets",
  "private_rooms_plus",
  "rival_analytics",
  "premium_cards",
  "profile_customisation",
  "ad_free",
];

/** Never sold, by rule. Documented so a future change has to delete this line on purpose. */
export const FORBIDDEN = ["rating_boost", "extra_strength", "score_multiplier", "competitive_advantage", "player_packs", "energy", "paid_rerolls"] as const;

export interface EntitlementState {
  plan: "free" | "era_plus";
  granted: readonly Entitlement[];
}

export const FREE: EntitlementState = { plan: "free", granted: [] };

export function has(state: EntitlementState, e: Entitlement): boolean {
  return state.granted.includes(e);
}

/**
 * VIRAL PAYWALL RULE — a received challenge is always playable for free, whatever rules
 * its creator used. Non-negotiable: shared challenges are the acquisition channel.
 */
export function canPlayReceivedChallenge(_state: EntitlementState, _challenge: { premiumRules: boolean }): true {
  return true;
}
