/**
 * PICK STATISTICS — data structures only.
 *
 * Rules (product): never fabricate a percentage; never show crowd data before the player
 * has made their own decision; below a minimum sample the answer is "no data", not a
 * guess. Nothing here is displayed in V1.2: there is no shared backend collecting events
 * yet, and a single device's history is not a crowd.
 *
 * Offer identity: stats are only comparable between players who saw the SAME offer, so
 * the key is (engineVersion, seed, rulesetId, round) — Daily XI and rooms naturally share it.
 */

export interface PickEvent {
  engineVersion: string;
  seed: string;
  rulesetId: string;
  round: number; // 0-based
  clubEraId: string;
  /** The pick opportunity: every option on the table (what the player chose FROM). */
  options?: string[];
  optionIndex: number;
  playerEraId: string;
  /** Where the pick landed (formation slot position) and in which formation. */
  position?: string;
  formation?: string;
  /** FIT change this pick caused for the picker's own XI (preview delta at pick time). */
  fitDelta: number;
  /** Filled when the season is known (may arrive later than the pick). */
  finalPoints: number | null;
  /** Live Duel only: did the picker win the duel. */
  duelWon: boolean | null;
  at: number;
}

export type OfferKey = string;

export function offerKey(e: Pick<PickEvent, "engineVersion" | "seed" | "rulesetId" | "round">): OfferKey {
  return `${e.engineVersion}|${e.seed}|${e.rulesetId}|${e.round}`;
}

export interface OptionStat {
  playerEraId: string;
  picks: number;
  /** picks / all picks of this offer. */
  pickRate: number;
  /** Mean final points of seasons that took this option (null when none finished). */
  avgPoints: number | null;
  /** Share of duels won after taking this option (null without duel data). */
  duelWinRate: number | null;
  /** Mean FIT change when taken. */
  avgFitDelta: number;
  label: "popular" | "contrarian" | null;
}

export interface OfferStat {
  key: OfferKey;
  total: number;
  options: OptionStat[];
}

/** Below this many picks of an offer, nothing is shown. */
export const MIN_SAMPLE = 30;
const POPULAR = 0.45;
const CONTRARIAN = 0.12;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Pure aggregation. Returns null when the sample is too small to say anything honest. */
export function aggregateOffer(events: readonly PickEvent[], key: OfferKey, minSample = MIN_SAMPLE): OfferStat | null {
  const mine = events.filter((e) => offerKey(e) === key);
  if (mine.length < minSample) return null;
  const by = new Map<string, PickEvent[]>();
  for (const e of mine) by.set(e.playerEraId, [...(by.get(e.playerEraId) ?? []), e]);
  const options: OptionStat[] = [...by.entries()].map(([playerEraId, es]) => {
    const pickRate = es.length / mine.length;
    const pts = es.map((e) => e.finalPoints).filter((x): x is number => x !== null);
    const duels = es.map((e) => e.duelWon).filter((x): x is boolean => x !== null);
    return {
      playerEraId,
      picks: es.length,
      pickRate,
      avgPoints: mean(pts),
      duelWinRate: duels.length ? duels.filter(Boolean).length / duels.length : null,
      avgFitDelta: mean(es.map((e) => e.fitDelta)) ?? 0,
      label: pickRate >= POPULAR ? "popular" : pickRate <= CONTRARIAN ? "contrarian" : null,
    };
  });
  options.sort((a, b) => b.picks - a.picks || a.playerEraId.localeCompare(b.playerEraId));
  return { key, total: mine.length, options };
}

/** The only gate the UI may use: real data, enough of it, and only after the player decided. */
export function visibleStat(stat: OfferStat | null, playerHasDecided: boolean): OfferStat | null {
  if (!playerHasDecided || !stat || stat.total < MIN_SAMPLE) return null;
  return stat;
}

/** Where events go. The V1.2 build keeps a local queue; a backend sink uploads it later. */
export interface PickStatsSink {
  record(event: PickEvent): void;
  /** Attach the season outcome to the events of one run. */
  settle(run: { engineVersion: string; seed: string; rulesetId: string }, finalPoints: number, duelWon: boolean | null): void;
  pending(): readonly PickEvent[];
}

const QUEUE_KEY = "eraxi:pickq";
const QUEUE_MAX = 220; // ~20 runs

export class LocalPickQueue implements PickStatsSink {
  constructor(private store: { get(k: string): string | null; set(k: string, v: string): void } | null) {}

  private read(): PickEvent[] {
    try {
      const raw = this.store?.get(QUEUE_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? (arr as PickEvent[]) : [];
    } catch {
      return [];
    }
  }

  private write(q: PickEvent[]) {
    try {
      this.store?.set(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_MAX)));
    } catch {
      /* quota — statistics are best-effort */
    }
  }

  record(event: PickEvent) {
    const q = this.read().filter((e) => !(offerKey(e) === offerKey(event) && e.at === event.at));
    q.push(event);
    this.write(q);
  }

  settle(run: { engineVersion: string; seed: string; rulesetId: string }, finalPoints: number, duelWon: boolean | null) {
    const q = this.read().map((e) =>
      e.engineVersion === run.engineVersion && e.seed === run.seed && e.rulesetId === run.rulesetId && e.finalPoints === null
        ? { ...e, finalPoints, duelWon }
        : e,
    );
    this.write(q);
  }

  pending() {
    return this.read();
  }
}

/**
 * Where crowd statistics come from. The shipped provider knows nothing (no backend), so
 * the UI shows nothing — a percentage is never invented. A backend provider would answer
 * from aggregated real picks; the UI still asks only AFTER the player's own pick.
 */
export interface PickStatsProvider {
  /** Share of players who took this option on this exact offer, or null when unknown. */
  pickRate(key: OfferKey, playerEraId: string): number | null;
}

export const NO_PICK_STATS: PickStatsProvider = { pickRate: () => null };

/**
 * MOST CONTRARIAN PICK of a run — for a future post-game insight ("7% of players chose him").
 * Only with real crowd data: every offer needs MIN_SAMPLE picks, the option must be labelled
 * contrarian, and the insight is shown AFTER the season, never while choosing.
 */
export function mostContrarianPick(mine: readonly PickEvent[], statOf: (key: OfferKey) => OfferStat | null): { event: PickEvent; pickRate: number; sample: number } | null {
  let best: { event: PickEvent; pickRate: number; sample: number } | null = null;
  for (const e of mine) {
    const s = statOf(offerKey(e));
    if (!s || s.total < MIN_SAMPLE) continue;
    const o = s.options.find((x) => x.playerEraId === e.playerEraId);
    if (!o || o.label !== "contrarian") continue;
    if (!best || o.pickRate < best.pickRate) best = { event: e, pickRate: o.pickRate, sample: s.total };
  }
  return best;
}

/** One player's share of picks that the crowd rarely made (null without enough crowd data). */
export function contrarianRate(mine: readonly PickEvent[], statOf: (key: OfferKey) => OfferStat | null): number | null {
  let known = 0;
  let rare = 0;
  for (const e of mine) {
    const s = statOf(offerKey(e));
    const o = s?.options.find((x) => x.playerEraId === e.playerEraId);
    if (!s || !o) continue;
    known++;
    if (o.label === "contrarian") rare++;
  }
  return known >= 11 ? rare / known : null;
}
