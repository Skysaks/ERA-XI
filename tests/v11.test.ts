import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  MODES,
  MODE_CATALOG,
  analyseRun,
  buildChallengePayload,
  buildLeague,
  canReroll,
  compareRuns,
  createDraft,
  currentOffer,
  decodeChallenge,
  draftRatings,
  encodeChallenge,
  generateDraw,
  isDraftComplete,
  lockedBucket,
  pickOption,
  previewPick,
  runSeason,
  seasonEvents,
  swapSlots,
} from "@/engine";
import { ALL_CLUB_ERAS, DATA_STATS, getClubEra, getPlayerEra, playerEraIdsOf } from "@/data";
import { OPPONENTS, LEAGUE_COMPOSITION } from "@/data/opponents";
import { DEFAULT_PROFILE, recordDiscovery, recordRun } from "@/game/storage";
import type { DraftConfig, DraftState, ModeId } from "@/types";

const cfg = (seed: string, mode: ModeId = "classic", formation: DraftConfig["formation"] = "433"): DraftConfig => ({
  seed,
  formation,
  mode,
  engineVersion: ENGINE_VERSION,
});
const playOut = (s: DraftState, choose: (s: DraftState) => number = (x) => x.round % 4) => {
  let st = s;
  while (!isDraftComplete(st)) st = pickOption(st, choose(st)).state;
  return st;
};
const SEEDS = Array.from({ length: 30 }, (_, i) => `v11seed${i}`);

describe("dataset", () => {
  it("is large and spans the 1950s to the 2020s", () => {
    expect(DATA_STATS.playerEras).toBeGreaterThanOrEqual(1000);
    expect(DATA_STATS.players).toBeGreaterThanOrEqual(800);
    const buckets = new Set(ALL_CLUB_ERAS.map((e) => e.bucket));
    for (const b of ["pre1980", "1980s", "1990s", "2000s", "2010s", "2020s"]) expect(buckets.has(b as never)).toBe(true);
    expect(Math.min(...ALL_CLUB_ERAS.map((e) => e.startYear))).toBeLessThanOrEqual(1960);
  });

  it("every era can field an offer with a keeper", () => {
    for (const era of ALL_CLUB_ERAS) {
      const players = era.playerEraIds.map(getPlayerEra);
      expect(players.length).toBeGreaterThanOrEqual(10);
      expect(players.some((p) => p.positions[0] === "GK")).toBe(true);
    }
  });

  it("the same player exists as distinct PlayerEras with different values", () => {
    const messi = playerEraIdsOf("messi").map(getPlayerEra);
    expect(messi.length).toBeGreaterThanOrEqual(4);
    expect(new Set(messi.map((m) => m.id)).size).toBe(messi.length);
    expect(new Set(messi.map((m) => m.overall)).size).toBeGreaterThan(1);
    expect(new Set(messi.map((m) => m.clubEraId)).size).toBe(messi.length);
  });

  it("ratings are derived from role-weighted attributes, not typed in", () => {
    // An override on an attribute the position values moves the rating; one it ignores does not.
    const messi = getPlayerEra("barcelona-2008:messi");
    expect(messi.overall).not.toBe(messi.level);
    for (const era of ALL_CLUB_ERAS.slice(0, 40)) {
      for (const id of era.playerEraIds) {
        const p = getPlayerEra(id);
        expect(Math.abs(p.overall - p.level)).toBeLessThanOrEqual(6);
      }
    }
  });

  it("all-time greats are calibrated consistently at their peak", () => {
    const peak = (pid: string) => Math.max(...playerEraIdsOf(pid).map((id) => getPlayerEra(id).overall));
    for (const legend of ["pele", "maradona", "cruyff", "messi", "di-stefano", "platini", "cristiano-ronaldo", "ronaldo", "beckenbauer"]) {
      const v = peak(legend);
      expect(v, legend).toBeGreaterThanOrEqual(95);
      expect(v, legend).toBeLessThanOrEqual(99);
    }
    // A legend's peak outranks his own later/earlier eras.
    const messiPeak = getPlayerEra("barcelona-2008:messi").overall;
    expect(messiPeak).toBeGreaterThan(getPlayerEra("psg-2017:messi").overall);
  });

  it("nations stay out of the club pool", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const d = generateDraw(seed);
      for (const o of [...d.rounds, d.reserve]) expect(getClubEra(o.clubEraId).kind).toBe("club");
    }
  });
});

describe("modes", () => {
  it("are configuration objects with a catalogue including planned modes", () => {
    for (const id of ["classic", "iq", "eralock", "noreroll"] as ModeId[]) expect(MODES[id].id).toBe(id);
    const ids = MODE_CATALOG.map((m) => m.id);
    for (const planned of ["daily", "rival", "nations", "oneclub", "champions", "position", "gauntlet", "mystery"]) expect(ids).toContain(planned);
  });

  it("Era Lock draws every offer from the seeded period", () => {
    for (const seed of SEEDS) {
      const s = createDraft(cfg(seed, "eralock"));
      const bucket = lockedBucket(seed, ENGINE_VERSION);
      expect(s.draw.bucket).toBe(bucket);
      for (const o of [...s.draw.rounds, s.draw.reserve]) expect(getClubEra(o.clubEraId).bucket).toBe(bucket);
    }
  });

  it("No Reroll has zero rerolls", () => {
    const s = createDraft(cfg("noreroll1", "noreroll"));
    expect(canReroll(s)).toBe(false);
  });

  it("challenges carry the mode and reproduce it", () => {
    const s = playOut(createDraft(cfg("eralockchal", "eralock")));
    const token = encodeChallenge(buildChallengePayload(s, runSeason(s), "Ana"));
    const d = decodeChallenge(token);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.challenge.payload.m).toBe("eralock");
      expect(d.challenge.creatorState.draw).toEqual(s.draw);
    }
  });
});

describe("era league", () => {
  it("19 distinct iconic opponents, stratified by tier, identical for a seed", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const a = buildLeague(seed, ENGINE_VERSION);
      expect(a).toHaveLength(19);
      expect(new Set(a.map((o) => o.def.id)).size).toBe(19);
      for (const [tier, n] of Object.entries(LEAGUE_COMPOSITION)) expect(a.filter((o) => o.def.tier === tier)).toHaveLength(n);
      expect(buildLeague(seed, ENGINE_VERSION)).toEqual(a);
    }
    expect(OPPONENTS.every((o) => o.name.length > 0 && /\d{4}/.test(o.name))).toBe(true);
  });

  it("each opponent is played exactly twice, once home and once away", () => {
    const s = playOut(createDraft(cfg("leaguehomeaway")));
    const r = runSeason(s);
    const by = new Map<string, boolean[]>();
    for (const m of r.matchResults) by.set(m.opponentId, [...(by.get(m.opponentId) ?? []), m.home]);
    expect(by.size).toBe(19);
    for (const v of by.values()) expect(v.sort()).toEqual([false, true]);
  });

  it("season events are deterministic and consistent with results", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const s = playOut(createDraft(cfg(seed)));
      const r = runSeason(s);
      expect(seasonEvents(r.matchResults)).toEqual(r.events);
      const firstL = r.matchResults.find((m) => m.outcome === "L");
      const fd = r.events.find((e) => e.kind === "first_defeat");
      if (fd) expect(fd.matchday).toBe(firstL?.matchday);
      if (r.losses === 0) expect(r.events.some((e) => e.kind === "invincible")).toBe(true);
      expect(r.events.length).toBeLessThanOrEqual(6);
    }
  });
});

describe("pick preview", () => {
  it("matches what the pick actually does", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      let s = createDraft(cfg(seed));
      while (!isDraftComplete(s)) {
        const i = s.round % 4;
        const pv = previewPick(s, i);
        const before = s.picks.length ? draftRatings(s).fit : 100;
        const out = pickOption(s, i);
        expect(pv?.slotIndex).toBe(out.slotIndex);
        expect(pv?.fitDelta).toBe(draftRatings(out.state).fit - before);
        s = out.state;
      }
    }
  });
});

describe("analysis + comparison", () => {
  it("summary lists real strengths/weaknesses and flags positional problems", () => {
    const s = playOut(createDraft(cfg("analysis1")));
    const bad = swapSlots(s, 0, 9); // keeper up front, striker in goal
    const a = analyseRun(bad, runSeason(bad));
    expect(a.positional.length).toBeGreaterThanOrEqual(2);
    expect(a.explanation.length).toBeGreaterThan(20);
    for (const w of a.weaknesses) expect(w.value).toBeLessThan(w.threshold);
    for (const st of a.strengths) expect(st.value).toBeGreaterThanOrEqual(st.threshold);
  });

  it("pick impact is a real counterfactual on the same draft", () => {
    const base = createDraft(cfg("rivalimpact"));
    const mine = playOut(base, () => 0);
    const theirs = playOut(base, (x) => (x.round % 2 === 0 ? 0 : 1));
    const c = compareRuns(
      { state: mine, ratings: draftRatings(mine), points: runSeason(mine).points },
      { state: theirs, ratings: draftRatings(theirs), points: runSeason(theirs).points },
      "Rival",
    );
    expect(c.differences.length).toBeGreaterThan(0);
    for (const d of c.differences) expect(d.impact).not.toBeNull();
    if (c.decisive) expect(c.decisive.impact?.pts).not.toBe(0);
  });
});

describe("local records + passport", () => {
  it("tracks bests, per-mode bests, daily official attempt and discoveries", () => {
    const s = playOut(createDraft({ ...cfg("records1"), daily: "2026-09-23" }));
    const r = runSeason(s);
    const run = { at: 1, seed: "records1", points: r.points, wins: r.wins, draws: r.draws, losses: r.losses, formation: "433" as const, mode: "classic" as const, overall: 80, fit: 80, daily: "2026-09-23" };
    const first = recordRun(DEFAULT_PROFILE, run, r, "tok");
    expect(first.isBest).toBe(false);
    expect(first.dailyAttempt).toBe("official");
    expect(first.profile.records.bestPoints).toBe(r.points);
    const second = recordRun(first.profile, { ...run, points: r.points + 1 }, r, "tok2");
    expect(second.isBest).toBe(true);
    expect(second.dailyAttempt).toBe("casual");
    expect(second.profile.daily["2026-09-23"]?.official.points).toBe(r.points);
    const withPassport = recordDiscovery(second.profile, s);
    expect(withPassport.passport.pickedPlayerEras).toHaveLength(11);
    expect(withPassport.passport.seenPlayerEras.length).toBeGreaterThanOrEqual(44);
    expect(currentOffer(s)).toBeNull();
  });
});
