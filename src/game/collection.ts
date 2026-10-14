import type { DraftState, FormationId, ModeId, SeasonResult } from "@/types";
import { formationOf, getFormation } from "@/engine";
import { getClubEra, getPlayerEra, nationOf, playerIdOf } from "@/data";
import { eraFacts } from "@/knowledge/facts";

/**
 * COLLECTION — the player's own football history on this device: an XI Gallery (saved
 * teams), per-player history, and Passport discoveries. Counts and ids only; no currency,
 * no packs. Everything is derived from completed, non-practice runs.
 */

export interface SavedXI {
  id: string;
  at: number;
  seed: string;
  mode: ModeId;
  /** The formation the XI actually played (post-draft change included). */
  formation: FormationId;
  /** PlayerEra ids, slot by slot. */
  lineup: string[];
  points: number;
  maxPoints: number;
  wins: number;
  draws: number;
  losses: number;
  ratings: { overall: number; att: number; mid: number; def: number; gk: number; fit: number };
  /** Challenge token: reopening replays the exact XI, sharing sends the same draw. */
  token: string | null;
  daily?: string;
  favourite: boolean;
}

export const GALLERY_RECENT = 12;
export const GALLERY_FAVOURITES = 40;

export function toSavedXI(draft: DraftState, result: SeasonResult, token: string | null, at = Date.now()): SavedXI {
  const r = result.teamRatings;
  return {
    id: `${draft.config.seed}:${at}`,
    at,
    seed: draft.config.seed,
    mode: draft.config.mode,
    formation: formationOf(draft),
    lineup: draft.lineup.map((id) => id ?? ""),
    points: result.points,
    maxPoints: result.maxPoints,
    wins: result.wins,
    draws: result.draws,
    losses: result.losses,
    ratings: { overall: r.overall, att: r.att, mid: r.mid, def: r.def, gk: r.gk, fit: r.fit },
    token,
    daily: draft.config.daily,
    favourite: false,
  };
}

// ── automatic best XIs ──
export type BestCategory = "season" | "iq" | "fit" | "attack" | "history";
const HISTORY_MODES: ModeId[] = ["eralock", "champions", "cult", "gauntlet"];
const league = (x: SavedXI) => x.maxPoints === 114;

const CATEGORY: Record<BestCategory, { scope: (x: SavedXI) => boolean; score: (x: SavedXI) => number; minRuns: number }> = {
  season: { scope: league, score: (x) => x.points, minRuns: 3 },
  iq: { scope: (x) => x.mode === "iq" && league(x), score: (x) => x.points, minRuns: 2 },
  fit: { scope: league, score: (x) => x.ratings.fit * 1000 + x.points, minRuns: 5 },
  attack: { scope: league, score: (x) => x.ratings.att * 1000 + x.points, minRuns: 5 },
  history: { scope: (x) => HISTORY_MODES.includes(x.mode) && league(x), score: (x) => x.points, minRuns: 2 },
};

/**
 * Best XI per category — only categories with enough history to mean something
 * (`minRuns` runs in scope). `runsInScope` counts every recorded run, not just saved ones.
 */
export function bestXIs(gallery: readonly SavedXI[], runs: readonly { mode: ModeId; points: number }[]): { category: BestCategory; xi: SavedXI }[] {
  const out: { category: BestCategory; xi: SavedXI }[] = [];
  for (const [category, c] of Object.entries(CATEGORY) as [BestCategory, (typeof CATEGORY)[BestCategory]][]) {
    const inScope = gallery.filter(c.scope);
    const runCount = category === "iq" ? runs.filter((r) => r.mode === "iq").length : category === "history" ? runs.filter((r) => HISTORY_MODES.includes(r.mode)).length : runs.length;
    if (!inScope.length || runCount < c.minRuns) continue;
    const xi = inScope.reduce((a, b) => (c.score(b) > c.score(a) ? b : a));
    out.push({ category, xi });
  }
  return out;
}

/** Keep favourites, the most recent, and whatever is currently best in a category. */
export function pruneGallery(list: readonly SavedXI[]): SavedXI[] {
  const sorted = [...list].sort((a, b) => b.at - a.at);
  const keep = new Set<string>();
  sorted.filter((x) => x.favourite).slice(0, GALLERY_FAVOURITES).forEach((x) => keep.add(x.id));
  sorted.filter((x) => !x.favourite).slice(0, GALLERY_RECENT).forEach((x) => keep.add(x.id));
  for (const c of Object.values(CATEGORY)) {
    const inScope = sorted.filter(c.scope);
    if (inScope.length) keep.add(inScope.reduce((a, b) => (c.score(b) > c.score(a) ? b : a)).id);
  }
  return sorted.filter((x) => keep.has(x.id));
}

export function addToGallery(list: readonly SavedXI[], xi: SavedXI): SavedXI[] {
  return pruneGallery([xi, ...list.filter((x) => x.id !== xi.id)]);
}

export function toggleFavourite(list: readonly SavedXI[], id: string): SavedXI[] {
  return pruneGallery(list.map((x) => (x.id === id ? { ...x, favourite: !x.favourite } : x)));
}

// ── player history: [drafts where seen, times drafted, best points when drafted, slot positions played] ──
export type HistoryRow = [number, number, number | null, Record<string, number>?];

/** The position he played most often in your XIs (null until drafted). */
export function preferredPosition(row: HistoryRow | undefined): string | null {
  const pos = row?.[3];
  if (!pos) return null;
  let best: string | null = null;
  for (const [k, n] of Object.entries(pos)) if (best === null || n > (pos[best] ?? 0)) best = k;
  return best;
}

export function updateHistory(history: Readonly<Record<string, HistoryRow>>, draft: DraftState, points: number | null): Record<string, HistoryRow> {
  const offers = [...draft.draw.rounds, ...(draft.rerollRound !== null ? [draft.draw.reserve] : [])];
  const shown = draft.shown ?? [];
  const seen = new Set<string>();
  offers.forEach((o, i) => (shown[i] ?? o).options.forEach((id) => seen.add(playerIdOf(id))));
  const picked = new Set(draft.picks.map((p) => playerIdOf(p.playerEraId)));
  // Where each drafted player ended up (the XI's final arrangement and formation).
  const slots = getFormation(formationOf(draft)).slots;
  const playedAt = new Map<string, string>();
  draft.lineup.forEach((id, i) => {
    if (id && slots[i]) playedAt.set(playerIdOf(id), slots[i]!.position);
  });
  const next = { ...history };
  for (const id of seen) {
    const row = next[id] ?? [0, 0, null];
    const drafted = picked.has(id);
    const at = drafted ? playedAt.get(id) : undefined;
    const pos = at ? { ...(row[3] ?? {}), [at]: (row[3]?.[at] ?? 0) + 1 } : row[3];
    const out: HistoryRow = [row[0] + 1, row[1] + (drafted ? 1 : 0), drafted && points !== null ? Math.max(row[2] ?? 0, points) : row[2]];
    if (pos) out.push(pos);
    next[id] = out;
  }
  return next;
}

// ── discoveries ──
export interface Discovery {
  kind: "era" | "nation";
  /** Club era id, or a nation code. */
  id: string;
}

/**
 * At most ONE discovery moment per run, and only a meaningful one: a team era with a
 * recorded honour (European Cup, World Cup, Euro…) drafted from for the first time, else a
 * nationality met for the first time. Never on the very first game (everything is new then).
 */
export function discoveryOf(draft: DraftState, known: { eras: readonly string[]; nations: readonly string[] }, gamesBefore: number): Discovery | null {
  if (gamesBefore < 1) return null;
  const knownEras = new Set(known.eras);
  const pickedEras = draft.picks.map((p) => getClubEra(getPlayerEra(p.playerEraId).clubEraId).id);
  const era = pickedEras.find((id) => !knownEras.has(id) && eraFacts(id).length > 0);
  if (era) return { kind: "era", id: era };
  const knownNations = new Set(known.nations);
  for (const p of draft.picks) {
    const n = nationOf(playerIdOf(p.playerEraId));
    if (n && n.confidence !== "low" && !knownNations.has(n.code)) return { kind: "nation", id: n.code };
  }
  return null;
}

/** Nationalities met in a draft (high/medium confidence only). */
export function nationsSeen(draft: DraftState): string[] {
  const out = new Set<string>();
  for (const o of draft.shown ?? draft.draw.rounds)
    for (const id of o.options) {
      const n = nationOf(playerIdOf(id));
      if (n && n.confidence !== "low") out.add(n.code);
    }
  return [...out];
}
