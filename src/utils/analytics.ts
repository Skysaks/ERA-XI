/**
 * Provider-agnostic analytics. Components emit typed events; a sink decides where
 * they go (console in dev, a vendor SDK or /api/events later). No provider hard-coded.
 */
import type { FormationId, ModeId } from "@/types";

interface Base {
  mode?: ModeId;
  formation?: FormationId;
  seed?: string;
  challenge?: boolean;
  daily?: boolean;
}

export type AnalyticsEvent =
  | ({ name: "landing_view"; hasChallenge: boolean } & Base)
  | ({ name: "play_clicked"; source: "home" | "daily" } & Base)
  | ({ name: "game_started" } & Base)
  | ({ name: "player_selected"; round: number; optionIndex: number; playerEraId: string; overall: number; outOfPosition: boolean; msSinceRoundStart: number } & Base)
  | ({ name: "reroll_used"; round: number } & Base)
  | ({ name: "draft_abandoned"; round: number } & Base)
  | ({ name: "draft_completed"; durationMs: number; fit: number; overall: number } & Base)
  | ({ name: "simulation_started" } & Base)
  | ({ name: "simulation_skipped"; atMatchday: number } & Base)
  | ({ name: "simulation_completed"; points: number } & Base)
  | ({ name: "result_viewed"; points: number; isBest: boolean } & Base)
  | ({ name: "play_again_clicked"; from: "result" | "challenge_result" } & Base)
  | ({ name: "challenge_created"; points: number; hasName: boolean } & Base)
  | ({ name: "challenge_opened"; valid: boolean; reason?: string } & Base)
  | ({ name: "challenge_started" } & Base)
  | ({ name: "challenge_completed"; outcome: "win" | "loss" | "draw"; margin: number } & Base)
  | ({ name: "share_clicked"; channel: "web_share" | "image" | "copy_link" | "download" } & Base)
  | ({ name: "room_opened"; action: "create" | "join" | "practice"; rulesetId: string } & Base)
  | ({ name: "room_finished"; kind: "duel" | "party"; won: boolean } & Base)
  // ── retention / funnel ──
  | ({ name: "time_to_first_play"; ms: number } & Base)
  | ({ name: "first_game_completion" } & Base)
  | ({ name: "second_game_start" } & Base)
  | ({ name: "session_runs"; count: number } & Base)
  | ({ name: "run_it_back"; afterPersonalBest: boolean } & Base)
  | ({ name: "replay_from_round"; round: number } & Base)
  | ({ name: "xi_adjusted" } & Base)
  | ({ name: "analysis_opened" } & Base)
  | ({ name: "personal_best_replay" } & Base)
  | ({ name: "daily_return"; daysSinceLast: number | null } & Base)
  | ({ name: "resume_draft"; round: number } & Base)
  | ({ name: "challenge_send"; channel: string } & Base)
  | ({ name: "duel_start"; rulesetId: string } & Base)
  | ({ name: "duel_completion"; rulesetId: string; won: boolean } & Base)
  | ({ name: "install_prompt_seen"; platform: "prompt" | "ios" | "installed" | "unsupported" } & Base)
  | ({ name: "install_dismissed" } & Base)
  | ({ name: "pwa_installed" } & Base)
  | ({ name: "account_conversion"; method: string } & Base)
  | ({ name: "eraplus_paywall_view"; feature: string } & Base)
  | ({ name: "eraplus_conversion"; plan: string } & Base)
  | ({ name: "settings_changed"; key: string } & Base)
  | ({ name: "app_error"; phase: string; message: string } & Base);

export type AnalyticsSink = (event: AnalyticsEvent & { ts: number; sessionId: string }) => void;

const sessionId = (() => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID().slice(0, 8) : String(Date.now() % 1e8);
})();

const buffer: (AnalyticsEvent & { ts: number; sessionId: string })[] = [];

let sink: AnalyticsSink = (e) => {
  buffer.push(e);
  if (buffer.length > 200) buffer.shift();
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    console.debug("[analytics]", e.name, e);
  }
};

export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

let enabled = true;
/** Consent switch (Settings → Privacy). Off = nothing is recorded, not even locally. */
export function setAnalyticsEnabled(on: boolean): void {
  enabled = on;
  if (!on) buffer.length = 0;
}

export function track(event: AnalyticsEvent): void {
  if (!enabled) return;
  try {
    sink({ ...event, ts: Date.now(), sessionId });
  } catch {
    /* analytics must never break gameplay */
  }
}

/** Debug/QA access to recent events. */
export function recentEvents() {
  return buffer.slice();
}
