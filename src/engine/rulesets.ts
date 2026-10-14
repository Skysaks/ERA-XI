import * as z from "zod/mini";
import type { EraBucket, FormationId, RulesetId, TeamKind } from "@/types";

export type { RulesetId };

/**
 * RULESET ENGINE
 *
 * A game mode is a GameRuleset: plain configuration read by draft generation, the draft
 * session, the season, the multiplayer room and the UI. Adding a mode = adding an entry
 * here (plus, only if it needs a genuinely new rule, one hook in the engine).
 */

export type EraFilter = { kind: "all" } | { kind: "seededBucket" } | { kind: "buckets"; buckets: EraBucket[] };
export type ClubFilter = { kind: "all" } | { kind: "seededClub" } | { kind: "seededLeague" } | { kind: "clubs"; ids: string[] };
export type NationFilter = { kind: "all" } | { kind: "nations"; ids: string[] };

/** How the seed is chosen — which is what makes runs comparable. */
export type SameSeed = "none" | "challenge" | "daily" | "room";
export type MultiplayerType = "solo" | "duel" | "party";
/** lockstep: everyone finishes round r before r+1 opens. free: nobody waits. */
export type RoundSync = "lockstep" | "free";

export interface GameRuleset {
  id: RulesetId;
  name: string;
  short: string;
  description: string;
  /** live: playable; prepared: configured, hidden or marked "soon". */
  status: "live" | "prepared";
  playerPool: TeamKind | "all";
  eraFilter: EraFilter;
  clubFilter: ClubFilter;
  nationFilter: NationFilter;
  ratingsVisible: boolean;
  formations: FormationId[] | "any";
  rerolls: 0 | 1 | 2;
  choiceCount: 3 | 4 | 5;
  /** Seconds per pick, null = untimed. */
  pickTimer: number | null;
  sameSeed: SameSeed;
  /** Shared Draft: a player taken by one participant disappears for the others. */
  sharedPool: boolean;
  multiplayerType: MultiplayerType;
  roundSync: RoundSync;
  maxPlayers: number;
  /** eraLeague38: 38-match ERA LEAGUE (/114). gauntlet: knockout run against 10 legendary XIs. */
  seasonType: "eraLeague38" | "gauntlet";
  /** Cult XI: players above this displayed rating never appear. */
  maxOverall: number | null;
  /** Champions: only squads that won the European Cup / Champions League. */
  championsOnly: boolean;
  /** Position Draft: every round names the slot to fill; the pick goes there. */
  positionTargets: boolean;
  /** Mystery XI: club and era stay hidden until the pick. */
  hiddenContext: boolean;
  /** What the player may choose before the draft (part of the draw, so challenges replay it). */
  playerChoice: "none" | "bucket" | "club" | "league";
  /** Ranked results must be verified server-side by replay before counting. */
  ranked: boolean;
  /** Engine features this ruleset needs; prepared rulesets may name ones not built yet. */
  requires: string[];
  /** Engine v4+: may the formation change after the draft (XI Complete → Formation)? */
  formationPolicy: "flexible" | "locked";
  /**
   * Engine v4+ Draft Director. adaptive: from round 5 one option reads the XI's needs;
   * shared: every participant sees identical, structured offers (rooms);
   * naive: v3-style random offers (Hardcore-style rulesets).
   */
  offerDirector: "adaptive" | "shared" | "naive";
  /** Engine v4+: keep a credible route to a coherent XI open in rounds 9–11 (adaptive only). */
  protectSolvability: boolean;
  /** How many draws may come from the same team (World XI: 1 — eleven different nations). */
  maxSameTeam: 1 | 2;
}

/** Features the current engine actually implements. */
export const IMPLEMENTED_FEATURES = new Set([
  "pool:club",
  "era:seededBucket",
  "era:buckets",
  "rerolls",
  "choiceCount",
  "sameSeed:daily",
  "sameSeed:room",
  "sameSeed:challenge",
  "multiplayer:duel",
  "multiplayer:party",
  "pool:nation",
  "club:seededClub",
  "pickTimer",
  "pool:tag:cult",
  "sharedPool",
  "season:gauntlet",
  "ui:hiddenContext",
  "pool:tag:champions",
  "round:positionTargets",
  "club:seededLeague",
  "event:weekly",
]);

const base = {
  playerPool: "club",
  eraFilter: { kind: "all" },
  clubFilter: { kind: "all" },
  nationFilter: { kind: "all" },
  ratingsVisible: true,
  formations: "any",
  rerolls: 1,
  choiceCount: 4,
  pickTimer: null,
  sameSeed: "challenge",
  sharedPool: false,
  multiplayerType: "solo",
  roundSync: "free",
  maxPlayers: 1,
  seasonType: "eraLeague38",
  maxOverall: null,
  championsOnly: false,
  positionTargets: false,
  hiddenContext: false,
  playerChoice: "none",
  ranked: false,
  requires: [],
  formationPolicy: "flexible",
  offerDirector: "adaptive",
  protectSolvability: true,
  maxSameTeam: 2,
} satisfies Omit<GameRuleset, "id" | "name" | "short" | "description" | "status">;

function rs(r: Partial<GameRuleset> & Pick<GameRuleset, "id" | "name" | "short" | "description" | "status">): GameRuleset {
  return { ...base, ...r } as GameRuleset;
}

export const RULESETS: Record<RulesetId, GameRuleset> = {
  classic: rs({ id: "classic", name: "Classic", short: "Ratings visible", description: "Every club, every era. Ratings on show.", status: "live" }),
  iq: rs({ id: "iq", name: "Football IQ", short: "Ratings hidden", description: "Same draft, no numbers. Trust your football knowledge.", status: "live", ratingsVisible: false }),
  daily: rs({
    id: "daily",
    name: "Daily XI",
    short: "Same draw for everyone",
    description: "One draw per day, the same for everyone. Your first attempt is the official one.",
    status: "live",
    sameSeed: "daily",
    ranked: true,
    requires: ["sameSeed:daily"],
  }),
  eralock: rs({
    id: "eralock",
    name: "Era Lock",
    short: "One period",
    description: "All 11 draws from a single period — 1950s–70s through the 2020s.",
    status: "live",
    eraFilter: { kind: "seededBucket" },
    playerChoice: "bucket",
    requires: ["era:seededBucket"],
  }),
  noreroll: rs({ id: "noreroll", name: "No Reroll", short: "Live with every draw", description: "Classic without the safety net.", status: "live", rerolls: 0 }),
  liveduel: rs({
    id: "liveduel",
    name: "Live Duel",
    short: "1v1 in real time",
    description: "Same draws, picked at the same time. Choices revealed together each round.",
    status: "live",
    rerolls: 0,
    sameSeed: "room",
    multiplayerType: "duel",
    roundSync: "lockstep",
    maxPlayers: 2,
    formationPolicy: "locked",
    offerDirector: "shared",
    requires: ["sameSeed:room", "multiplayer:duel"],
  }),
  party: rs({
    id: "party",
    name: "Party Room",
    short: "2–8 players",
    description: "Everyone gets the same draft and plays at their own pace. One ranking at the end.",
    status: "live",
    rerolls: 0,
    sameSeed: "room",
    multiplayerType: "party",
    roundSync: "free",
    maxPlayers: 8,
    formationPolicy: "locked",
    offerDirector: "shared",
    requires: ["sameSeed:room", "multiplayer:party"],
  }),
  // ── V1.3 ──
  nations: rs({
    id: "nations",
    name: "Nations",
    short: "International XIs",
    description: "Draft from legendary national teams: Brazil 1970, Netherlands 1974, Spain 2010…",
    status: "live",
    playerPool: "nation",
    requires: ["pool:nation"],
  }),
  worldxi: rs({
    id: "worldxi",
    name: "World XI",
    short: "One player per nation",
    description: "Eleven draws from eleven different national teams. One player per nation.",
    status: "live",
    playerPool: "nation",
    maxSameTeam: 1,
    requires: ["pool:nation"],
  }),
  oneclub: rs({
    id: "oneclub",
    name: "One Club",
    short: "One badge, every era",
    description: "All 11 draws from one club's history. Pick the club or let the draw decide.",
    status: "live",
    clubFilter: { kind: "seededClub" },
    playerChoice: "club",
    rerolls: 0,
    requires: ["club:seededClub"],
  }),
  blitz: rs({
    id: "blitz",
    name: "Blitz",
    short: "8 seconds a pick",
    description: "8 seconds per pick. Run out and the draw picks for you.",
    status: "live",
    rerolls: 0,
    pickTimer: 8,
    requires: ["pickTimer"],
  }),
  cult: rs({
    id: "cult",
    name: "Cult XI",
    short: "No stars above 86",
    description: "Nobody rated above 86. Win the league with cult heroes and unsung starters.",
    status: "live",
    maxOverall: 86,
    requires: ["pool:tag:cult"],
  }),
  shared: rs({
    id: "shared",
    name: "Shared Draft",
    short: "Take him, they can't",
    description: "1v1, one pool. Picks alternate each round — whoever goes first takes a player the other can't.",
    status: "live",
    rerolls: 0,
    sharedPool: true,
    sameSeed: "room",
    multiplayerType: "duel",
    roundSync: "lockstep",
    maxPlayers: 2,
    formationPolicy: "locked",
    offerDirector: "shared",
    requires: ["sharedPool", "multiplayer:duel", "sameSeed:room"],
  }),
  gauntlet: rs({
    id: "gauntlet",
    name: "Gauntlet",
    short: "10 legends, one life",
    description: "Knockout run against 10 legendary XIs, weakest to strongest. One defeat ends it.",
    status: "live",
    seasonType: "gauntlet",
    requires: ["season:gauntlet"],
  }),
  mystery: rs({
    id: "mystery",
    name: "Mystery XI",
    short: "Clubs hidden",
    description: "Club, era and ratings hidden until you pick. Recognise the players.",
    status: "live",
    ratingsVisible: false,
    hiddenContext: true,
    requires: ["ui:hiddenContext"],
  }),
  champions: rs({
    id: "champions",
    name: "Champions",
    short: "Winners only",
    description: "Only squads that won the European Cup or the Champions League.",
    status: "live",
    championsOnly: true,
    requires: ["pool:tag:champions"],
  }),
  oneleague: rs({
    id: "oneleague",
    name: "One League",
    short: "One country's clubs",
    description: "Every draw from one country's clubs across the decades.",
    status: "live",
    clubFilter: { kind: "seededLeague" },
    playerChoice: "league",
    requires: ["club:seededLeague"],
  }),
  weekly: rs({
    id: "weekly",
    name: "Weekly Event",
    short: "This week's theme",
    description: "A rotating theme on the classic rules. New theme every Monday.",
    status: "live",
    requires: ["event:weekly"],
  }),
  position: rs({
    id: "position",
    name: "Position Draft",
    short: "Fill the slot",
    description: "Each round names the position to fill. The pick goes straight there.",
    status: "live",
    rerolls: 0,
    positionTargets: true,
    formationPolicy: "locked",
    offerDirector: "naive",
    requires: ["round:positionTargets"],
  }),
};

export const RULESET_IDS = Object.keys(RULESETS) as RulesetId[];
export const LIVE_RULESETS = RULESET_IDS.filter((id) => RULESETS[id].status === "live");
/** Rulesets a solo draft (and a challenge link) can use. */
export const SOLO_RULESET_IDS = LIVE_RULESETS.filter((id) => RULESETS[id].multiplayerType === "solo");

export function getRuleset(id: RulesetId): GameRuleset {
  return RULESETS[id];
}

export function isRulesetId(v: string): v is RulesetId {
  return (RULESET_IDS as string[]).includes(v);
}

// ── validation ──

const BUCKETS = ["pre1980", "1980s", "1990s", "2000s", "2010s", "2020s"] as const;
const FORMATIONS = ["433", "4231", "442", "352", "343", "4312", "41212", "4321", "424", "4222", "3421", "532", "523"] as const;

export const RulesetSchema = z.object({
  id: z.string().check(z.regex(/^[a-z]{2,16}$/)),
  name: z.string().check(z.minLength(2), z.maxLength(24)),
  short: z.string().check(z.maxLength(32)),
  description: z.string().check(z.maxLength(160)),
  status: z.enum(["live", "prepared"]),
  playerPool: z.enum(["club", "nation", "all"]),
  eraFilter: z.union([
    z.object({ kind: z.literal("all") }),
    z.object({ kind: z.literal("seededBucket") }),
    z.object({ kind: z.literal("buckets"), buckets: z.array(z.enum(BUCKETS)).check(z.minLength(1)) }),
  ]),
  clubFilter: z.union([
    z.object({ kind: z.literal("all") }),
    z.object({ kind: z.literal("seededClub") }),
    z.object({ kind: z.literal("seededLeague") }),
    z.object({ kind: z.literal("clubs"), ids: z.array(z.string()).check(z.minLength(1)) }),
  ]),
  nationFilter: z.union([z.object({ kind: z.literal("all") }), z.object({ kind: z.literal("nations"), ids: z.array(z.string()).check(z.minLength(1)) })]),
  ratingsVisible: z.boolean(),
  formations: z.union([z.literal("any"), z.array(z.enum(FORMATIONS)).check(z.minLength(1))]),
  rerolls: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  choiceCount: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  pickTimer: z.nullable(z.int().check(z.gte(5), z.lte(60))),
  sameSeed: z.enum(["none", "challenge", "daily", "room"]),
  sharedPool: z.boolean(),
  multiplayerType: z.enum(["solo", "duel", "party"]),
  roundSync: z.enum(["lockstep", "free"]),
  maxPlayers: z.int().check(z.gte(1), z.lte(8)),
  seasonType: z.enum(["eraLeague38", "gauntlet"]),
  maxOverall: z.nullable(z.int().check(z.gte(70), z.lte(99))),
  championsOnly: z.boolean(),
  positionTargets: z.boolean(),
  hiddenContext: z.boolean(),
  playerChoice: z.enum(["none", "bucket", "club", "league"]),
  ranked: z.boolean(),
  requires: z.array(z.string()),
  formationPolicy: z.enum(["flexible", "locked"]),
  offerDirector: z.enum(["adaptive", "shared", "naive"]),
  protectSolvability: z.boolean(),
  maxSameTeam: z.union([z.literal(1), z.literal(2)]),
});

/** Structural + semantic checks. Returns a list of problems (empty = valid). */
export function validateRuleset(r: unknown): string[] {
  const parsed = RulesetSchema.safeParse(r);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const x = parsed.data;
  const errors: string[] = [];
  if (x.multiplayerType === "solo" && x.maxPlayers !== 1) errors.push("solo rulesets have exactly 1 player");
  if (x.multiplayerType === "duel" && x.maxPlayers !== 2) errors.push("duels have exactly 2 players");
  if (x.multiplayerType === "party" && (x.maxPlayers < 2 || x.maxPlayers > 8)) errors.push("party rooms hold 2–8 players");
  if (x.multiplayerType !== "solo" && x.sameSeed !== "room") errors.push("multiplayer rulesets share a room seed");
  if (x.multiplayerType !== "solo" && x.rerolls !== 0) errors.push("multiplayer rulesets have no rerolls (identical offers every round)");
  if (x.multiplayerType === "duel" && x.roundSync !== "lockstep") errors.push("duels reveal picks together: lockstep rounds");
  if (x.multiplayerType !== "solo" && x.offerDirector === "adaptive") errors.push("rooms need identical offers for every seat: shared or naive director");
  if (x.positionTargets && x.formationPolicy !== "locked") errors.push("position drafts lock the formation (targets are slots)");
  if (x.sharedPool && x.multiplayerType === "solo") errors.push("a shared pool needs several players");
  if (x.positionTargets && x.rerolls !== 0) errors.push("position drafts have no reroll (the reserve has no target)");
  if (x.playerChoice === "club" && x.clubFilter.kind !== "seededClub") errors.push("a club choice needs a one-club filter");
  if (x.playerChoice === "league" && x.clubFilter.kind !== "seededLeague") errors.push("a league choice needs a one-league filter");
  if (x.playerChoice === "bucket" && x.eraFilter.kind !== "seededBucket") errors.push("a period choice needs an era-lock filter");
  if (x.championsOnly && x.playerPool !== "club") errors.push("the Champions filter is for club squads");
  if (x.ranked && x.sameSeed !== "daily" && x.sameSeed !== "room") errors.push("ranked play needs a shared seed");
  if (x.status === "live") {
    const missing = x.requires.filter((f) => !IMPLEMENTED_FEATURES.has(f));
    if (missing.length) errors.push(`live ruleset needs unbuilt features: ${missing.join(", ")}`);
  }
  return errors;
}

/** Everything draft generation needs from a ruleset. */
export interface DrawRules {
  pool: TeamKind | "all";
  eraFilter: EraFilter;
  clubFilter: ClubFilter;
  nationFilter: NationFilter;
  choiceCount: 3 | 4 | 5;
  maxOverall: number | null;
  championsOnly: boolean;
  positionTargets: boolean;
  /** Country codes (teams.ts `country`): clubs and nations from these countries only. */
  countries: string[] | null;
  /** Player ids that never appear (e.g. "No Ballon d'Or" week). */
  excludePlayers: string[] | null;
  offerDirector: "adaptive" | "shared" | "naive";
  protectSolvability: boolean;
  maxSameTeam: 1 | 2;
  /**
   * Engine v6+: a themed week can guarantee some rounds from a spotlight (a club, or a country's
   * clubs and national team) while the rest of the draw stays classic — "AC Milan week" without
   * breaking the two-eras-per-team rule. Ignored by older engines.
   */
  featured?: { teams?: string[]; countries?: string[]; rounds: number } | null;
}

export function drawRulesOf(r: GameRuleset): DrawRules {
  return {
    pool: r.playerPool,
    eraFilter: r.eraFilter,
    clubFilter: r.clubFilter,
    nationFilter: r.nationFilter,
    choiceCount: r.choiceCount,
    maxOverall: r.maxOverall,
    championsOnly: r.championsOnly,
    positionTargets: r.positionTargets,
    countries: null,
    excludePlayers: null,
    offerDirector: r.offerDirector,
    protectSolvability: r.protectSolvability,
    maxSameTeam: r.maxSameTeam,
  };
}
