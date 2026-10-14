import type { ModeId } from "@/types";
import { RULESETS, RULESET_IDS, drawRulesOf, type DrawRules } from "./rulesets";

/**
 * UI-facing view of the ruleset registry (engine/rulesets.ts is the source of truth).
 * Kept so screens can say MODES[id].label / .showRatings without knowing ruleset internals.
 */
export type { DrawRules };

export interface GameMode {
  id: ModeId;
  label: string;
  short: string;
  description: string;
  showRatings: boolean;
  rerolls: number;
  draw: DrawRules;
}

export const MODES = Object.fromEntries(
  RULESET_IDS.map((id) => {
    const r = RULESETS[id];
    return [id, { id, label: r.name, short: r.short, description: r.description, showRatings: r.ratingsVisible, rerolls: r.rerolls, draw: drawRulesOf(r) }];
  }),
) as Record<ModeId, GameMode>;

/** Solo rule-sets a player can select as their default (Daily is an entry point, not a default). */
export const MODE_IDS: ModeId[] = ["classic", "iq", "eralock", "oneclub", "oneleague", "nations", "worldxi", "champions", "cult", "position", "gauntlet", "mystery", "blitz", "noreroll"];

/** The two modes that stay one tap away on Home. */
export const PRIMARY_MODES: ModeId[] = ["classic", "iq"];

export function isModeId(v: string): v is ModeId {
  return (MODE_IDS as string[]).includes(v);
}

/** Modes that count for records (includes Daily and multiplayer results). */
export const RECORD_MODE_IDS: ModeId[] = [
  "classic", "iq", "daily", "weekly", "eralock", "oneclub", "oneleague", "nations", "worldxi", "champions", "cult", "position", "gauntlet", "mystery", "blitz", "noreroll", "liveduel", "shared", "party",
];

export type CatalogStatus = "live" | "entry" | "multiplayer" | "soon";

export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  status: CatalogStatus;
  /** Solo rule-set to select (live). */
  mode?: ModeId;
}

const entry = (id: ModeId, status: CatalogStatus): CatalogEntry => ({
  id,
  label: RULESETS[id].name,
  description: RULESETS[id].description,
  status,
  mode: status === "live" ? id : undefined,
});

/** "Modes" sheet: multiplayer first, then solo variants, then what is coming. */
export const MODE_CATALOG: CatalogEntry[] = [
  entry("liveduel", "multiplayer"),
  entry("shared", "multiplayer"),
  entry("party", "multiplayer"),
  entry("daily", "entry"),
  { id: "rival", label: "Rival", description: "Send any result as a link — your friend plays the exact same 11 draws.", status: "entry" },
  entry("classic", "live"),
  entry("iq", "live"),
  entry("eralock", "live"),
  entry("oneclub", "live"),
  entry("nations", "live"),
  entry("champions", "live"),
  entry("cult", "live"),
  entry("position", "live"),
  entry("gauntlet", "live"),
  entry("mystery", "live"),
  entry("blitz", "live"),
  entry("noreroll", "live"),
  entry("oneleague", "live"),
  entry("weekly", "live"),
  entry("worldxi", "live"),
  ...RULESET_IDS.filter((id) => RULESETS[id].status === "prepared").map((id) => entry(id, "soon")),
];

/**
 * "Modes" sheet grouping (V1.4): a few simple groups instead of a dashboard.
 * Every entry is still a ruleset — the groups are presentation only.
 */
export type ModeGroupId = "core" | "history" | "identity" | "skill" | "social";

const RIVAL: CatalogEntry = MODE_CATALOG.find((m) => m.id === "rival")!;

/**
 * Modes browser (V1.5 information architecture). Groups are presentation only — every
 * entry is still a ruleset. Nations sits first in IDENTITY so it is found immediately.
 */
export const MODE_GROUPS: { id: ModeGroupId; entries: CatalogEntry[] }[] = [
  { id: "core", entries: [entry("classic", "live"), entry("iq", "live"), entry("daily", "entry")] },
  { id: "identity", entries: [entry("nations", "live"), entry("worldxi", "live"), entry("oneclub", "live"), entry("oneleague", "live")] },
  { id: "history", entries: [entry("eralock", "live"), entry("champions", "live"), entry("cult", "live"), entry("gauntlet", "live")] },
  { id: "skill", entries: [entry("blitz", "live"), entry("noreroll", "live"), entry("position", "live"), entry("mystery", "live")] },
  { id: "social", entries: [RIVAL, entry("liveduel", "multiplayer"), entry("party", "multiplayer"), entry("shared", "multiplayer")] },
];
