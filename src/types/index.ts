/**
 * ERA XI domain types.
 * Pure data shapes — no React, no Next.js, no DOM. Safe to share with a future Expo app.
 */

export type Position =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "LWB"
  | "RWB"
  | "DM"
  | "CM"
  | "AM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "ST";

export type Line = "GK" | "DEF" | "MID" | "ATT";

/** Tactical archetype. Drives default attribute shape and role-overlap detection. */
export type Role =
  | "GK" // shot-stopper
  | "SK" // sweeper keeper
  | "BPD" // ball-playing centre-back
  | "STP" // stopper
  | "FB" // attacking full-back
  | "DFB" // defensive full-back
  | "WB" // wing-back
  | "ANC" // anchor
  | "BW" // ball winner
  | "DLP" // deep-lying playmaker
  | "B2B" // box-to-box
  | "PM" // advanced playmaker
  | "WNG" // winger
  | "IF" // inside forward
  | "TM" // target man
  | "PCH" // poacher
  | "F9" // false nine
  | "CF" // complete forward
  | "PRS"; // pressing forward

export const ATTRIBUTE_KEYS = [
  "finishing",
  "creation",
  "progression",
  "retention",
  "defence",
  "pressing",
  "pace",
  "physical",
  "aerial",
  "buildUp",
  "goalkeeping",
  "distribution",
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

/** Period buckets used by Era Lock and the Era Passport. */
export type EraBucket = "pre1980" | "1980s" | "1990s" | "2000s" | "2010s" | "2020s";

export type TeamKind = "club" | "nation";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  /** Neutral kit accent, used as a thin stripe only (no crests/logos). */
  color: string;
  kind: TeamKind;
  country: string;
}

/** Back-compat alias: most eras belong to clubs. */
export type Club = Team;

export interface ClubEra {
  id: string;
  /** Team id (club or nation). */
  clubId: string;
  kind: TeamKind;
  /** Display label: "2008–2012" or "1970". */
  label: string;
  startYear: number;
  endYear: number;
  bucket: EraBucket;
  playerEraIds: string[];
  /** First engine version whose draws include this era (dataset versioning). */
  since: number;
  /** European Cup / Champions League finals won by this squad (clubs). */
  europeanCups: number[];
  /** Authoring provenance: "core" (V1 files, most reviewed) or "expansion" (V1.3+ files). Internal. */
  provenance?: "core" | "expansion";
}

export interface Player {
  id: string;
  name: string;
}

/** A player as he was at one club in one era. The unit that gets drafted. */
export interface PlayerEra extends Attributes {
  id: string;
  playerId: string;
  name: string;
  shortName: string;
  clubId: string;
  clubEraId: string;
  era: string;
  /** First entry is the natural position. */
  positions: Position[];
  /** Authored anchor for this era (editorial calibration scale). */
  level: number;
  /** Displayed rating: derived from role-weighted attributes at the natural position. */
  overall: number;
  roles: Role[];
}

export type FormationId =
  | "433"
  | "4231"
  | "442"
  | "352"
  | "343"
  | "4312"
  | "41212"
  | "4321"
  | "424"
  | "4222"
  | "3421"
  | "532"
  | "523";

export interface FormationSlot {
  id: string;
  position: Position;
  /** 0 (left) → 100 (right) */
  x: number;
  /** 0 (own goal) → 100 (opponent goal) */
  y: number;
}

export interface Formation {
  id: FormationId;
  label: string;
  slots: FormationSlot[];
}

/** Every ruleset (see engine/rulesets.ts). Some are "prepared" and not playable yet. */
export type RulesetId =
  | "classic"
  | "iq"
  | "daily"
  | "eralock"
  | "noreroll"
  | "liveduel"
  | "party"
  | "nations"
  | "oneclub"
  | "blitz"
  | "cult"
  | "shared"
  | "gauntlet"
  | "mystery"
  | "champions"
  | "position"
  | "oneleague"
  | "weekly"
  | "worldxi";

/** Back-compat name used across the UI. */
export type ModeId = RulesetId;

/** One club/era offering with the four player choices. */
export interface DraftOffer {
  clubEraId: string;
  options: string[]; // PlayerEra ids
  /** Engine v4 base offers: the option the Draft Director may replace from round 5. */
  flex?: string;
  /** Engine v4: the option the Director tailored to this XI, and why. */
  directed?: { playerEraId: string; reason: "need" | "fit" };
}

/** Everything that is fixed by the seed: identical for creator and challenger. */
export interface DraftDraw {
  seed: string;
  engineVersion: string;
  /** Set when the mode locks every draw to one period (Era Lock). */
  bucket: EraBucket | null;
  /** Set when the mode draws from one club (One Club). */
  clubId: string | null;
  /** Set when the mode draws from one country's clubs (One League). */
  league?: string | null;
  /** Position Draft: formation slot index to fill in each round. */
  targets: number[] | null;
  rounds: DraftOffer[]; // 11
  reserve: DraftOffer; // used by the single reroll
}

export interface DraftPick {
  round: number;
  optionIndex: number;
  playerEraId: string;
  rerolled: boolean;
}

export interface DraftConfig {
  seed: string;
  formation: FormationId;
  mode: ModeId;
  engineVersion: string;
  /** Present for Daily XI runs. */
  daily?: string;
  /** Player's pre-draft choice where the ruleset allows one (period / club / league). Omitted = drawn by the seed. */
  choice?: DraftChoice;
  /** Weekly event id (mode "weekly"): the event's rule overrides are part of the draw. */
  event?: string;
}

export type DraftChoice = { bucket: EraBucket } | { clubId: string } | { league: string };

export interface DraftState {
  config: DraftConfig;
  draw: DraftDraw;
  round: number; // 0-based, 11 when complete
  picks: DraftPick[];
  rerollRound: number | null;
  /** Slot index → PlayerEra id. Same length as formation slots. */
  lineup: (string | null)[];
  /** Formation chosen after the draft (engine v4+); absent = the draft formation. */
  formation?: FormationId;
  /** Engine v4+: the offer actually shown in each round (Draft Director), by round index. */
  shown?: DraftOffer[];
}

export type TacticalDimension =
  | "width"
  | "finishing"
  | "creation"
  | "progression"
  | "retention"
  | "coverage"
  | "ballWinning"
  | "pace"
  | "aerial"
  | "buildUp";

export type TacticalProfile = Record<TacticalDimension, number>;

export interface TeamRatings {
  att: number;
  mid: number;
  def: number;
  gk: number;
  overall: number;
  fit: number;
  dims: TacticalProfile;
  outOfPosition: number; // count of players in unfamiliar slots
  overlap: number; // role-overlap count
  /** Engine v4+: role relationships that moved FIT (explainable, see engine/fit.ts). */
  synergies?: { id: string; delta: number; players: string[] }[];
}

export type ImpactTone = "up" | "down";
export interface Impact {
  label: string;
  tone: ImpactTone;
  /** i18n key for the label. */
  key: string;
}

export type OpponentTier = "giant" | "elite" | "strong" | "dangerous";

export interface MatchResult {
  matchday: number;
  opponent: string;
  opponentId: string;
  opponentTier: OpponentTier;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  outcome: "W" | "D" | "L";
  /** Gauntlet ties go to penalties: [yours, theirs]. */
  penalties?: [number, number] | null;
}

export interface SeasonResult {
  engineVersion: string;
  /** league: 38-match ERA LEAGUE, points /114. gauntlet: legends beaten /10. */
  format: "league" | "gauntlet";
  maxPoints: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  matchResults: MatchResult[];
  teamRatings: TeamRatings;
  /** Presentation-only story beats, derived deterministically from the results. */
  events: SeasonEvent[];
}

export type SeasonEventKind = "first_defeat" | "statement_win" | "five_goals" | "unbeaten_run" | "winning_streak" | "invincible";

export interface SeasonEvent {
  /** Values for the localized label (score "3–1", opponent short name, run length). */
  params?: Record<string, string | number>;
  matchday: number;
  kind: SeasonEventKind;
  label: string;
}
