/**
 * Local persistence (no account). Everything is wrapped: storage can be missing,
 * full or blocked (private mode, embedded frames) and the game must still work.
 * The shape is versioned and migrates forward so it can later sync to a server profile.
 */
import type { DraftState, EraBucket, FormationId, ModeId, SeasonResult } from "@/types";
import { isLang, type Lang } from "@/i18n";
import { getClubEra, playerIdOf } from "@/data";
import { isFormationId, isModeId } from "@/engine";
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from "./settings";
import { addActivity, localDay } from "./form";
import { newlyUnlocked } from "./achievements";
import type { RunDNA } from "./dna";
import { addToGallery, discoveryOf, nationsSeen, toSavedXI, updateHistory, type Discovery, type HistoryRow, type SavedXI } from "./collection";

export interface RunSummary {
  at: number;
  seed: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  formation: FormationId;
  mode: ModeId;
  overall: number;
  fit: number;
  daily?: string;
  challengeOf?: string | null;
  /** A reroll was used (for achievements). */
  rerollUsed?: boolean;
  /** A rematch run against this named rival. */
  rival?: string | null;
}

export interface ChallengeRecord {
  at: number;
  token: string;
  opponent: string; // display name or "Friend"
  theirs: number;
  yours: number;
  /** Live Duel: equal points are decided by the head-to-head match. */
  won?: boolean;
  duel?: boolean;
}

/**
 * MY ERA activity — a short local log of what happened (never a social network: only events this
 * device witnessed). "Daily available" is computed, never stored.
 */
export type FeedEvent =
  | { at: number; k: "pb"; n: number; prev: number | null }
  | { at: number; k: "vs"; opp: string; yours: number; theirs: number; won: boolean | null; duel?: boolean }
  | { at: number; k: "era"; id: string }
  | { at: number; k: "nation"; id: string }
  | { at: number; k: "ach"; id: string };

export const FEED_MAX = 20;

export interface Records {
  bestPoints: number | null;
  bestAtt: number | null;
  bestMid: number | null;
  bestDef: number | null;
  bestFit: number | null;
  bestGk: number | null;
  byMode: Partial<Record<ModeId, number>>;
  /** League seasons without a defeat. */
  unbeaten: number;
  /** League seasons with 100+ points. */
  hundreds: number;
}

/**
 * Daily XI: the first completed attempt of a date is the official one. The token lets a
 * future backend verify it by replay (seed + decisions), so only it would be ranked;
 * later attempts are casual replays and never overwrite it.
 */
export interface DailyEntry {
  official: { points: number; wins: number; draws: number; losses: number; at: number; token: string | null };
  attempts: number;
  bestCasual: number | null;
}

/** Discovery log for a future Era Passport. Ids only; no grind, no currency. */
export interface Passport {
  seenPlayerEras: string[];
  pickedPlayerEras: string[];
  players: string[];
  clubs: string[];
  eras: string[];
  /** Nationalities met in drafts (FIFA-style codes). */
  nations: string[];
}

export interface Prefs {
  mode: ModeId;
  formation: FormationId;
  /** null until the player picks one: the browser language is used meanwhile. */
  lang: Lang | null;
  /** Pre-draft choices (null = let the draw decide). */
  eraBucket: EraBucket | null;
  oneClub: string | null;
  oneLeague: string | null;
  /** Formations kept one tap away on Home (most recent first, max 4). */
  recentFormations: FormationId[];
}

export interface StoredProfile {
  v: 1;
  games: number;
  /** Mirror of records.bestPoints (kept for v1 readers). */
  bestScore: number | null;
  recent: RunSummary[];
  prefs: Prefs;
  name: string;
  challenges: ChallengeRecord[];
  daily: Record<string, DailyEntry>;
  records: Records;
  passport: Passport;
  /** How many results have been shown — "83 PTS / 114" until the scale is familiar. */
  scoringSeen: number;
  /** Career totals. Plain counts from real games — no XP, no currency. */
  career: Career;
  settings: Settings;
  /** Local days (YYYY-MM-DD) with at least one completed game — drives FORM. */
  activity: string[];
  /** Achievement id → unlock time. */
  achievements: Record<string, number>;
  /** Per-run decision features for Draft DNA (last 200). */
  dna: RunDNA[];
  install: InstallState;
  account: AccountState;
  /** XI Gallery: favourites, recent runs and category bests (see collection.ts). */
  gallery: SavedXI[];
  /** playerId → [drafts where he was offered, times drafted, best points when drafted, positions played]. */
  history: Record<string, HistoryRow>;
  /** MY ERA activity (newest first, capped). */
  feed: FeedEvent[];
}

/** PWA install suggestion: shown only after real engagement, never again once dismissed. */
export interface InstallState {
  dismissed: boolean;
  seen: number;
  installed: boolean;
}

/** Guest-first: an account is optional and only offered where it adds value. */
export interface AccountState {
  kind: "guest";
  /** Anonymous local id — would link a future account's history. */
  guestId: string;
}

export interface Career {
  /** Sum of points over every completed season (average = totalPoints / games). */
  totalPoints: number;
  /** Seasons included in totalPoints (older profiles only kept their last 20 runs). */
  seasons: number;
  duel: { wins: number; losses: number };
  party: { played: number; wins: number };
  /** Rooms already counted (`code:generation`), so a reload never double-counts. */
  rooms: string[];
}

const EMPTY_CAREER: Career = { totalPoints: 0, seasons: 0, duel: { wins: 0, losses: 0 }, party: { played: 0, wins: 0 }, rooms: [] };

const KEY = "eraxi:v1";
const BUCKETS: string[] = ["pre1980", "1980s", "1990s", "2000s", "2010s", "2020s"];

const EMPTY_RECORDS: Records = { bestPoints: null, bestAtt: null, bestMid: null, bestDef: null, bestFit: null, bestGk: null, byMode: {}, unbeaten: 0, hundreds: 0 };
const EMPTY_PASSPORT: Passport = { seenPlayerEras: [], pickedPlayerEras: [], players: [], clubs: [], eras: [], nations: [] };

export const DEFAULT_PROFILE: StoredProfile = {
  v: 1,
  games: 0,
  bestScore: null,
  recent: [],
  prefs: { mode: "classic", formation: "433", lang: null, eraBucket: null, oneClub: null, oneLeague: null, recentFormations: ["433", "4231", "442", "352"] },
  name: "",
  challenges: [],
  daily: {},
  records: EMPTY_RECORDS,
  passport: EMPTY_PASSPORT,
  scoringSeen: 0,
  career: EMPTY_CAREER,
  settings: DEFAULT_SETTINGS,
  activity: [],
  achievements: {},
  dna: [],
  install: { dismissed: false, seen: 0, installed: false },
  account: { kind: "guest", guestId: "" },
  gallery: [],
  history: {},
  feed: [],
};

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function migrateDaily(raw: unknown): Record<string, DailyEntry> {
  const out: Record<string, DailyEntry> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Partial<DailyEntry> & { points?: number; at?: number };
    if (e.official) out[k] = { official: e.official, attempts: num(e.attempts) ?? 1, bestCasual: num(e.bestCasual) };
    else if (typeof e.points === "number") {
      // v1.0 shape: { points, at }
      out[k] = { official: { points: e.points, wins: 0, draws: 0, losses: 0, at: e.at ?? 0, token: null }, attempts: 1, bestCasual: null };
    }
  }
  return out;
}

function migrateCareer(raw: unknown, recent: unknown): Career {
  const c = (raw && typeof raw === "object" ? raw : {}) as Partial<Career>;
  // Pre-1.2 profiles: seed from the recent runs still stored, so the average stays exact over what is known.
  const runs = Array.isArray(recent) ? recent.filter((r): r is { points: number } => num((r as { points?: unknown })?.points) !== null) : [];
  const legacy = num(c.totalPoints) === null;
  return {
    totalPoints: legacy ? runs.reduce((a, r) => a + r.points, 0) : num(c.totalPoints)!,
    seasons: legacy ? runs.length : num(c.seasons) ?? 0,
    duel: { wins: num(c.duel?.wins) ?? 0, losses: num(c.duel?.losses) ?? 0 },
    party: { played: num(c.party?.played) ?? 0, wins: num(c.party?.wins) ?? 0 },
    rooms: strArr(c.rooms).slice(0, 40),
  };
}

/** Average season (null until a season exists, or when legacy history is incomplete). */
export function averagePoints(p: StoredProfile): number | null {
  if (p.career.seasons === 0) return null;
  return Math.round(p.career.totalPoints / p.career.seasons);
}

/** Count a finished room once. A duel against a named opponent also feeds the rivalry and the activity log. */
export function recordRoom(p: StoredProfile, key: string, kind: "duel" | "party", won: boolean, vs?: { opponent: string; yours: number; theirs: number }): StoredProfile {
  if (p.career.rooms.includes(key)) return p;
  const c = p.career;
  if (kind === "duel" && vs && vs.opponent.trim()) {
    const at = Date.now();
    p = recordChallenge(p, { at, token: `room:${key}`, opponent: vs.opponent.trim(), yours: vs.yours, theirs: vs.theirs, won, duel: true });
    p = addFeed(p, [{ at, k: "vs", opp: vs.opponent.trim(), yours: vs.yours, theirs: vs.theirs, won, duel: true }]);
  }
  return {
    ...p,
    career: {
      ...c,
      duel: kind === "duel" ? { wins: c.duel.wins + (won ? 1 : 0), losses: c.duel.losses + (won ? 0 : 1) } : c.duel,
      party: kind === "party" ? { played: c.party.played + 1, wins: c.party.wins + (won ? 1 : 0) } : c.party,
      rooms: [key, ...c.rooms].slice(0, 40),
    },
  };
}

/** Private per-device token for rooms (never shown; the public seat id is separate). */
export function deviceToken(): string {
  const s = storage();
  const make = () => {
    const bytes = new Uint8Array(18);
    globalThis.crypto?.getRandomValues?.(bytes);
    let out = "";
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (const b of bytes) out += abc[(b || Math.floor(Math.random() * 256)) % 64];
    return out;
  };
  try {
    const existing = s?.getItem("eraxi:device");
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
    const t = make();
    s?.setItem("eraxi:device", t);
    return t;
  } catch {
    return make();
  }
}

export function loadProfile(): StoredProfile {
  const s = storage();
  if (!s) return { ...DEFAULT_PROFILE };
  try {
    const raw = s.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const p = JSON.parse(raw) as Partial<StoredProfile>;
    if (!p || typeof p !== "object") throw new Error("not an object");
    if (p.v !== 1) {
      // A profile from a newer (or unknown) schema: keep it aside rather than overwrite it.
      preserveUnreadable(s, raw);
      return { ...DEFAULT_PROFILE };
    }
    const mode = p.prefs && isModeId(p.prefs.mode) ? p.prefs.mode : "classic";
    const formation = p.prefs && isFormationId(p.prefs.formation) ? p.prefs.formation : "433";
    const r = (p.records ?? {}) as Partial<Records>;
    const bestPoints = num(r.bestPoints) ?? num(p.bestScore);
    const pp = (p.passport ?? {}) as Partial<Passport>;
    return {
      v: 1,
      games: num(p.games) ?? 0,
      bestScore: bestPoints,
      recent: Array.isArray(p.recent) ? p.recent.slice(0, 20) : [],
      prefs: {
        mode,
        formation,
        lang: p.prefs && isLang(p.prefs.lang) ? p.prefs.lang : null,
        eraBucket: p.prefs && typeof p.prefs.eraBucket === "string" && BUCKETS.includes(p.prefs.eraBucket) ? p.prefs.eraBucket : null,
        oneClub: p.prefs && typeof p.prefs.oneClub === "string" && /^[a-z0-9-]{2,24}$/.test(p.prefs.oneClub) ? p.prefs.oneClub : null,
        oneLeague: p.prefs && typeof p.prefs.oneLeague === "string" && /^[A-Z]{3}$/.test(p.prefs.oneLeague) ? p.prefs.oneLeague : null,
        recentFormations: (() => {
          const raw = Array.isArray(p.prefs?.recentFormations) ? (p.prefs.recentFormations as unknown[]).filter((x): x is FormationId => typeof x === "string" && isFormationId(x)) : [];
          const list = [...new Set(raw)].slice(0, 4);
          return list.length ? list : (["433", "4231", "442", "352"] as FormationId[]);
        })(),
      },
      name: typeof p.name === "string" ? p.name.slice(0, 16) : "",
      challenges: Array.isArray(p.challenges) ? p.challenges.slice(0, 50) : [],
      daily: migrateDaily(p.daily),
      records: {
        bestPoints,
        bestAtt: num(r.bestAtt),
        bestMid: num(r.bestMid),
        bestDef: num(r.bestDef),
        bestFit: num(r.bestFit),
        bestGk: num(r.bestGk),
        byMode: r.byMode && typeof r.byMode === "object" ? r.byMode : {},
        unbeaten: num(r.unbeaten) ?? 0,
        hundreds: num(r.hundreds) ?? 0,
      },
      passport: {
        seenPlayerEras: strArr(pp.seenPlayerEras),
        pickedPlayerEras: strArr(pp.pickedPlayerEras),
        players: strArr(pp.players),
        clubs: strArr(pp.clubs),
        eras: strArr(pp.eras),
        nations: strArr(pp.nations).filter((c) => /^[A-Z]{3}$/.test(c)),
      },
      scoringSeen: num(p.scoringSeen) ?? (num(p.games) ?? 0),
      career: migrateCareer(p.career, p.recent),
      settings: sanitizeSettings(p.settings),
      activity: strArr(p.activity).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-60),
      achievements: p.achievements && typeof p.achievements === "object" ? Object.fromEntries(Object.entries(p.achievements).filter(([, v]) => typeof v === "number")) : {},
      dna: Array.isArray(p.dna) ? p.dna.slice(-200) : [],
      install: {
        dismissed: Boolean(p.install?.dismissed),
        seen: num(p.install?.seen) ?? 0,
        installed: Boolean(p.install?.installed),
      },
      account: { kind: "guest", guestId: typeof p.account?.guestId === "string" ? p.account.guestId : "" },
      gallery: sanitizeGallery(p.gallery),
      history: sanitizeHistory(p.history),
      feed: sanitizeFeed(p.feed),
    };
  } catch {
    // Corrupted JSON: keep a copy before the next save replaces it (recoverable by support/export).
    try {
      const raw = s.getItem(KEY);
      if (raw) preserveUnreadable(s, raw);
    } catch {
      /* storage unavailable */
    }
    return { ...DEFAULT_PROFILE };
  }
}

function sanitizeGallery(raw: unknown): SavedXI[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is SavedXI => !!x && typeof x === "object" && typeof (x as SavedXI).id === "string" && Array.isArray((x as SavedXI).lineup) && typeof (x as SavedXI).points === "number" && isFormationId((x as SavedXI).formation) && isModeId((x as SavedXI).mode))
    .slice(0, 80);
}

function sanitizeFeed(raw: unknown): FeedEvent[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v);
  return raw
    .filter((e): e is FeedEvent => {
      if (!e || typeof e !== "object" || typeof (e as FeedEvent).at !== "number") return false;
      const x = e as Record<string, unknown>;
      switch (x.k) {
        case "pb":
          return typeof x.n === "number";
        case "vs":
          return typeof x.opp === "string" && typeof x.yours === "number" && typeof x.theirs === "number";
        case "era":
          return str(x.id, /^[a-z0-9-]{3,40}$/);
        case "nation":
          return str(x.id, /^[A-Z]{3}$/);
        case "ach":
          return str(x.id, /^[a-zA-Z0-9-]{2,30}$/);
        default:
          return false;
      }
    })
    .slice(0, FEED_MAX);
}

export function addFeed(p: StoredProfile, events: FeedEvent[]): StoredProfile {
  if (!events.length) return p;
  return { ...p, feed: [...events, ...p.feed].slice(0, FEED_MAX) };
}

function sanitizeHistory(raw: unknown): Record<string, HistoryRow> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, HistoryRow> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v) || typeof v[0] !== "number" || typeof v[1] !== "number") continue;
    const row: HistoryRow = [v[0], v[1], typeof v[2] === "number" ? v[2] : null];
    if (v[3] && typeof v[3] === "object" && !Array.isArray(v[3])) {
      const pos = Object.fromEntries(Object.entries(v[3] as Record<string, unknown>).filter(([p, n]) => /^[A-Z]{2,3}$/.test(p) && typeof n === "number"));
      if (Object.keys(pos).length) row.push(pos as Record<string, number>);
    }
    out[k] = row;
  }
  return out;
}

/** The unreadable profile is kept once under a side key (never overwritten by a later failure). */
function preserveUnreadable(s: Storage, raw: string): void {
  try {
    if (!s.getItem(`${KEY}:unreadable`)) s.setItem(`${KEY}:unreadable`, raw.slice(0, 200_000));
  } catch {
    /* quota: nothing more to do */
  }
}

export function saveProfile(p: StoredProfile): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota or blocked — ignore */
  }
}

const maxOf = (a: number | null, b: number) => (a === null ? b : Math.max(a, b));

export interface RecordOutcome {
  profile: StoredProfile;
  /** Beat a previous best (never true on the very first game). */
  isBest: boolean;
  /** Best before this run, for "Personal best 91 — 8 pts away". */
  previousBest: number | null;
  isModeBest: boolean;
  previousModeBest: number | null;
  dailyAttempt: "official" | "casual" | null;
  /** Achievements unlocked by this run (ids). */
  achievements: string[];
}

export function recordRun(p: StoredProfile, run: RunSummary, result: SeasonResult, token: string | null = null): RecordOutcome {
  const prevBest = p.records.bestPoints;
  const prevModeBest = p.records.byMode[run.mode] ?? null;
  const t = result.teamRatings;
  // Gauntlet scores are legends beaten (/10): they only count toward their own mode best.
  const league = result.format !== "gauntlet";
  const records: Records = {
    bestPoints: league ? maxOf(prevBest, run.points) : prevBest,
    bestAtt: maxOf(p.records.bestAtt, t.att),
    bestMid: maxOf(p.records.bestMid, t.mid),
    bestDef: maxOf(p.records.bestDef, t.def),
    bestFit: maxOf(p.records.bestFit, t.fit),
    bestGk: maxOf(p.records.bestGk, t.gk),
    byMode: { ...p.records.byMode, [run.mode]: maxOf(prevModeBest, run.points) },
    unbeaten: p.records.unbeaten + (league && result.losses === 0 ? 1 : 0),
    hundreds: p.records.hundreds + (league && run.points >= 100 ? 1 : 0),
  };
  const unlocked = newlyUnlocked(p.achievements, { mode: run.mode, result, rerollUsed: Boolean(run.rerollUsed), rerollsAvailable: 0 });
  const achievements = { ...p.achievements };
  for (const id of unlocked) achievements[id] = run.at;
  const daily = { ...p.daily };
  let dailyAttempt: RecordOutcome["dailyAttempt"] = null;
  if (run.daily) {
    const existing = daily[run.daily];
    if (!existing) {
      dailyAttempt = "official";
      daily[run.daily] = {
        official: { points: run.points, wins: run.wins, draws: run.draws, losses: run.losses, at: run.at, token },
        attempts: 1,
        bestCasual: null,
      };
    } else {
      dailyAttempt = "casual";
      daily[run.daily] = { ...existing, attempts: existing.attempts + 1, bestCasual: maxOf(existing.bestCasual, run.points) };
    }
  }
  return {
    isBest: league && prevBest !== null && run.points > prevBest,
    previousBest: prevBest,
    isModeBest: prevModeBest !== null && run.points > prevModeBest,
    previousModeBest: prevModeBest,
    dailyAttempt,
    achievements: unlocked,
    profile: {
      ...p,
      games: p.games + 1,
      bestScore: records.bestPoints,
      recent: [run, ...p.recent].slice(0, 20),
      daily,
      records,
      scoringSeen: p.scoringSeen + 1,
      career: league ? { ...p.career, totalPoints: p.career.totalPoints + run.points, seasons: p.career.seasons + 1 } : p.career,
      achievements,
      activity: addActivity(p.activity, localDay(new Date(run.at))),
    },
  };
}

function mergeUnique(a: string[], add: Iterable<string>): string[] {
  const set = new Set(a);
  for (const x of add) set.add(x);
  return [...set];
}

/** Log everything this draft showed and what was picked. */
export function recordDiscovery(p: StoredProfile, draft: DraftState): StoredProfile {
  const offers = [...draft.draw.rounds];
  if (draft.rerollRound !== null) offers.push(draft.draw.reserve);
  const seen = offers.flatMap((o) => o.options);
  const picked = draft.picks.map((x) => x.playerEraId);
  const eras = offers.map((o) => o.clubEraId);
  return {
    ...p,
    passport: {
      seenPlayerEras: mergeUnique(p.passport.seenPlayerEras, seen),
      pickedPlayerEras: mergeUnique(p.passport.pickedPlayerEras, picked),
      players: mergeUnique(p.passport.players, picked.map(playerIdOf)),
      clubs: mergeUnique(p.passport.clubs, eras.map((e) => getClubEra(e).clubId)),
      eras: mergeUnique(p.passport.eras, eras),
      nations: mergeUnique(p.passport.nations, nationsSeen(draft)),
    },
  };
}

/**
 * Collection after a completed (non-practice) run: XI Gallery, player history, and the one
 * discovery moment worth showing (computed BEFORE the passport records this run).
 */
export function recordCollection(p: StoredProfile, draft: DraftState, result: SeasonResult, token: string | null, gamesBefore: number): { profile: StoredProfile; discovery: Discovery | null } {
  const discovery = discoveryOf(draft, { eras: p.passport.eras, nations: p.passport.nations }, gamesBefore);
  return {
    discovery,
    profile: {
      ...p,
      gallery: addToGallery(p.gallery, toSavedXI(draft, result, token)),
      history: updateHistory(p.history, draft, result.format === "league" ? result.points : null),
    },
  };
}

export function recordChallenge(p: StoredProfile, rec: ChallengeRecord): StoredProfile {
  const rest = p.challenges.filter((c) => c.token !== rec.token);
  return { ...p, challenges: [rec, ...rest].slice(0, 50) };
}

const outcomeOf = (g: ChallengeRecord): 1 | 0 | -1 => (g.won !== undefined ? (g.won ? 1 : -1) : g.yours > g.theirs ? 1 : g.yours < g.theirs ? -1 : 0);

/** Head-to-head against a named rival, from real local results only (challenges + Live Duels). */
export function rivalryRecord(p: StoredProfile, opponent: string): { you: number; them: number; draws: number } | null {
  const games = p.challenges.filter((c) => c.opponent.toLowerCase() === opponent.toLowerCase());
  if (games.length === 0) return null;
  let you = 0,
    them = 0,
    draws = 0;
  for (const g of games) {
    const o = outcomeOf(g);
    if (o > 0) you++;
    else if (o < 0) them++;
    else draws++;
  }
  return { you, them, draws };
}

export interface Rival {
  name: string;
  games: number;
  you: number;
  them: number;
  draws: number;
  yourAvg: number;
  theirAvg: number;
  yourBest: number;
  theirBest: number;
  last: ChallengeRecord;
}

/** Rivalries worth a card: the same named opponent at least `min` times. Anonymous "Friend" is never a rival. */
export const RIVAL_MIN_GAMES = 3;
export function rivals(p: StoredProfile, min = RIVAL_MIN_GAMES): Rival[] {
  const by = new Map<string, ChallengeRecord[]>();
  for (const c of p.challenges) {
    const name = c.opponent.trim();
    if (!name || name.toLowerCase() === "friend") continue;
    const k = name.toLowerCase();
    by.set(k, [...(by.get(k) ?? []), c]);
  }
  const out: Rival[] = [];
  for (const games of by.values()) {
    if (games.length < min) continue;
    const r = rivalryRecord(p, games[0]!.opponent)!;
    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    const last = games.reduce((a, b) => (b.at > a.at ? b : a));
    out.push({
      name: last.opponent,
      games: games.length,
      ...r,
      yourAvg: avg(games.map((g) => g.yours)),
      theirAvg: avg(games.map((g) => g.theirs)),
      yourBest: Math.max(...games.map((g) => g.yours)),
      theirBest: Math.max(...games.map((g) => g.theirs)),
      last,
    });
  }
  return out.sort((a, b) => b.last.at - a.last.at);
}

export function recordDNA(p: StoredProfile, dna: RunDNA): StoredProfile {
  return { ...p, dna: [...p.dna, dna].slice(-200) };
}

/** Everything stored on this device, as JSON (data export). */
export function exportData(): string {
  const s = storage();
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; s && i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith("eraxi:")) out[k] = JSON.parse(s.getItem(k) ?? "null");
    }
  } catch {
    /* ignore */
  }
  return JSON.stringify(out, null, 2);
}

/** Delete everything ERA XI stored on this device. */
export function deleteAllData(): void {
  const s = storage();
  try {
    const keys: string[] = [];
    for (let i = 0; s && i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith("eraxi:")) keys.push(k);
    }
    for (const k of keys) s?.removeItem(k);
  } catch {
    /* ignore */
  }
}


/** Keep a formation one tap away on Home: new ones replace the oldest, known ones stay put. */
export function rememberFormation(recent: readonly FormationId[], f: FormationId): FormationId[] {
  if (recent.includes(f)) return [...recent];
  return [f, ...recent].slice(0, 4);
}
