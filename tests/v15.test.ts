import { describe, expect, it } from "vitest";
import type { DraftConfig, DraftState, FormationId, ModeId, PlayerEra, Position, Role, TeamRatings } from "@/types";
import {
  ALL_FORMATION_IDS,
  ENGINE_VERSION,
  MODE_GROUPS,
  RULESETS,
  applyProjection,
  arrangeFor,
  assessSlot,
  buildChallengePayload,
  canonicalArrangement,
  changeFormation,
  createDraft,
  currentOffer,
  decodeChallenge,
  destinationsFor,
  draftRatings,
  encodeChallenge,
  expectedSeason,
  explainFit,
  formationFlexible,
  formationOf,
  formationOptions,
  getFormation,
  healthCheck,
  isDraftComplete,
  lineupPlayers,
  optimiseXI,
  pickOption,
  positionRatings,
  rateLineup,
  replayDraft,
  replayFrom,
  runSeason,
  simulateSeason,
  solvability,
  swapSlots,
  turningPoints,
  validateFormation,
  validateRuleset,
  RULESET_IDS,
  explainRating,
} from "@/engine";
import { ALL_CLUB_ERAS, getClubEra, getPlayerEra } from "@/data";
import { reducer, type GameState } from "@/game/machine";

const V = ENGINE_VERSION;
const cfg = (seed: string, mode: ModeId = "classic", formation: FormationId = "433", extra: Partial<DraftConfig> = {}): DraftConfig => ({ seed, formation, mode, engineVersion: V, ...extra });
const SEEDS = Array.from({ length: 24 }, (_, i) => `vfifteen${i}`);

/** Random chooser that stays on a complete in-position route whenever one exists. */
function careful(s: DraftState, k: number): number {
  const offer = currentOffer(s)!;
  const ok: number[] = [];
  offer.options.forEach((_, i) => {
    try {
      const n = pickOption(s, i).state;
      if (isDraftComplete(n) ? canonicalOop(n) === 0 : solvability(n).feasible) ok.push(i);
    } catch {
      /* duplicate player */
    }
  });
  return ok.length ? ok[k % ok.length]! : 0;
}
function canonicalOop(s: DraftState): number {
  const f = getFormation(s.config.formation);
  return rateLineup(canonicalArrangement(s.picks.map((p) => getPlayerEra(p.playerEraId)), f), f, V).outOfPosition;
}
function playOut(s: DraftState, pick: (s: DraftState) => number = () => 0): DraftState {
  let st = s;
  while (!isDraftComplete(st)) st = pickOption(st, pick(st)).state;
  return st;
}
const allPlayers = (): PlayerEra[] => ALL_CLUB_ERAS.flatMap((e) => e.playerEraIds.map(getPlayerEra));
const findPlayer = (pred: (p: PlayerEra) => boolean) => allPlayers().find(pred)!;

describe("formations", () => {
  it("thirteen valid formations, all playable", () => {
    expect(ALL_FORMATION_IDS.length).toBe(13);
    for (const id of ALL_FORMATION_IDS) {
      expect(validateFormation(getFormation(id))).toEqual([]);
      const s = playOut(createDraft(cfg(`form${id}`, "classic", id)));
      expect(runSeason(s).wins + runSeason(s).draws + runSeason(s).losses).toBe(38);
    }
  });
});

describe("Draft Director & solvability", () => {
  it("rounds 1–4 are shared; later offers keep the era and at least three shared options", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      let s = createDraft(cfg(seed));
      while (!isDraftComplete(s)) {
        const base = s.draw.rounds[s.round]!;
        const shown = currentOffer(s)!;
        expect(shown.clubEraId).toBe(base.clubEraId);
        if (s.round < 4) expect(shown.options).toEqual(base.options);
        else expect(shown.options.filter((id) => base.options.includes(id)).length).toBeGreaterThanOrEqual(3);
        expect(new Set(shown.options.map((id) => getPlayerEra(id).positions[0])).size).toBeGreaterThanOrEqual(2);
        s = pickOption(s, 0).state;
      }
    }
  });

  it("a careful player always keeps a complete in-position route (standard modes)", () => {
    for (const mode of ["classic", "nations", "cult", "oneclub"] as ModeId[]) {
      for (const [i, seed] of SEEDS.slice(0, 10).entries()) {
        let s = createDraft(cfg(seed, mode, ALL_FORMATION_IDS[i % 13]!));
        let k = i;
        while (!isDraftComplete(s)) {
          if (s.round >= 4) expect(solvability(s).feasible).toBe(true);
          s = pickOption(s, careful(s, k++)).state;
        }
        expect(canonicalOop(s)).toBe(0);
      }
    }
  });

  it("late rounds offer a way to fill the scarcest open slot (need-aware option)", () => {
    let tailored = 0;
    for (const seed of SEEDS) {
      let s = createDraft(cfg(seed));
      while (!isDraftComplete(s)) {
        const o = currentOffer(s)!;
        if (s.round >= 8 && o.directed?.reason === "need") {
          tailored++;
          const sol = solvability(s);
          const f = getFormation(s.config.formation);
          const p = getPlayerEra(o.directed.playerEraId);
          // Either it fills an empty slot, or (protection) it is the option that keeps a complete
          // in-position route through the later rounds — possibly via a re-arrangement.
          const fills = sol.empty.some((slot) => assessSlot(p, f.slots[slot]!.position).familiarity >= 0.86);
          const keeps = solvability(pickOption(s, o.options.indexOf(p.id)).state).feasible;
          expect(fills || keeps).toBe(true);
        }
        s = pickOption(s, careful(s, s.round)).state;
      }
    }
    expect(tailored).toBeGreaterThan(0);
  });

  it("offers depend on the drafted set, not on manual arrangement — challenges replay exactly", () => {
    const a = createDraft(cfg("arrangeseed"));
    let s1 = a, s2 = a;
    for (let r = 0; r < 6; r++) {
      s1 = pickOption(s1, r % 3).state;
      s2 = pickOption(s2, r % 3).state;
      if (r === 3) s2 = swapSlots(s2, 1, 2); // manual move on one copy
    }
    expect(currentOffer(s1)).toEqual(currentOffer(s2));
    const done = playOut(s1, (s) => s.round % 4);
    const token = encodeChallenge(buildChallengePayload(done, runSeason(done)));
    const d = decodeChallenge(token);
    expect(d.ok).toBe(true);
  });

  it("rooms keep identical offers (shared director) and hardcore-style rulesets can go naive", () => {
    for (const id of ["liveduel", "party", "shared"] as ModeId[]) expect(RULESETS[id].offerDirector).toBe("shared");
    for (const id of RULESET_IDS) expect(validateRuleset(RULESETS[id])).toEqual([]);
    const bad = { ...RULESETS.liveduel, offerDirector: "adaptive" };
    expect(validateRuleset(bad).length).toBeGreaterThan(0);
    const s = createDraft(cfg("roomseed", "liveduel"));
    let st = s;
    while (!isDraftComplete(st)) {
      expect(currentOffer(st)).toEqual(st.draw.rounds[st.round]);
      st = pickOption(st, 0).state;
    }
  });
});

describe("positions, ratings and roles", () => {
  it("a player rates exactly his overall at his natural position; secondary ones carry a small, visible cost", () => {
    for (const p of allPlayers().slice(0, 400)) {
      const rows = positionRatings(p);
      expect(rows[0]!.kind).toBe("natural");
      expect(rows[0]!.rating).toBe(p.overall);
      for (const r of rows.filter((x) => x.kind === "secondary")) expect(Math.abs(r.rating - p.overall)).toBeLessThanOrEqual(8);
      const why = explainRating(p);
      expect(why.level + why.profile).toBe(p.overall);
    }
  });

  it("role relationships are explainable rules", () => {
    const f = getFormation("442");
    const pick = (pos: Position, role: Role, extra: (p: PlayerEra) => boolean = () => true) =>
      findPlayer((p) => p.positions[0] === pos && p.roles[0] === role && extra(p));
    const gk = pick("GK", "GK");
    const lineup: PlayerEra[] = [
      gk,
      pick("LB", "FB", (p) => p.creation >= 78),
      pick("CB", "STP"),
      findPlayer((p) => p.positions[0] === "CB" && p.roles[0] === "STP" && p.id !== pick("CB", "STP").id),
      pick("RB", "FB", (p) => p.creation >= 78),
      pick("LM", "WNG", (p) => p.creation >= 78),
      pick("CM", "BW"),
      pick("CM", "DLP"),
      pick("RM", "WNG", (p) => p.creation >= 78),
      pick("ST", "TM"),
      pick("ST", "PCH"),
    ];
    const r = rateLineup(lineup, f, V);
    const ids = (r.synergies ?? []).map((x) => x.id);
    expect(ids).toContain("crosses");
    expect(ids).toContain("partnership");
    const x = explainFit(lineup, f, V);
    const raw = 100 + x.items.reduce((a, it) => a + it.delta, 0);
    expect(Math.round(Math.max(30, Math.min(100, raw)))).toBe(x.fit);
    // v3 has no role relationships: old links keep their numbers.
    expect(rateLineup(lineup, f, "3").synergies).toBeUndefined();

    // Conflict: two strikers wanting the same space, creators without a holding midfielder.
    const conflict = lineup.slice();
    conflict[10] = findPlayer((p) => p.positions[0] === "ST" && p.roles[0] === "TM" && p.playerId !== lineup[9]!.playerId);
    conflict[6] = pick("CM", "PM");
    conflict[7] = findPlayer((p) => p.positions[0] === "CM" && p.roles[0] === "PM" && p.id !== conflict[6]!.id);
    const c = rateLineup(conflict, f, V);
    const cids = (c.synergies ?? []).map((x) => x.id);
    expect(cids).toContain("sameSpace");
    expect(cids).toContain("noBallWinner");
    expect(c.fit).toBeLessThan(r.fit);
  });
});

describe("formation flexibility, repositioning and optimisation", () => {
  it("formation changes re-arrange the XI; locked rulesets refuse", () => {
    const s = playOut(createDraft(cfg("flexseed")), (st) => careful(st, st.round));
    expect(formationFlexible(s)).toBe(true);
    const opts = formationOptions(s);
    expect(opts.length).toBe(13);
    const best = opts.reduce((a, b) => (b.expected > a.expected ? b : a));
    const moved = changeFormation(s, best.formation === "433" ? "4231" : best.formation);
    expect(formationOf(moved)).not.toBe("433");
    expect(new Set(moved.lineup)).toEqual(new Set(s.lineup));
    // Auto-repositioning is at least as good as keeping the old slot order.
    const naive = { ...moved, lineup: s.lineup.slice() };
    expect(draftRatings(moved).outOfPosition).toBeLessThanOrEqual(draftRatings(naive).outOfPosition);
    const pos = playOut(createDraft(cfg("posseed", "position")));
    expect(formationFlexible(pos)).toBe(false);
    expect(() => changeFormation(pos, "442")).toThrow();
  });

  it("a formation change travels in the challenge link and replays to the same score", () => {
    const s = playOut(createDraft(cfg("glinkseed")), (st) => careful(st, st.round));
    const moved = changeFormation(s, "4231");
    const res = runSeason(moved);
    const d = decodeChallenge(encodeChallenge(buildChallengePayload(moved, res, "Ana")));
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.challenge.payload.g).toBe("4231");
      expect(d.challenge.creatorResult.points).toBe(res.points);
      expect(formationOf(d.challenge.creatorState)).toBe("4231");
    }
  });

  it("manual moves during the draft are respected and destinations show honest ratings", () => {
    let st: GameState = { phase: "DRAFTING", run: { challenge: null, rival: null, startedAt: 0 }, draft: createDraft(cfg("moveseed")), lastPick: null };
    for (let r = 0; r < 3; r++) st = reducer(st, { type: "PICK", optionIndex: r });
    if (st.phase !== "DRAFTING") throw new Error("phase");
    const from = st.draft.lineup.findIndex(Boolean);
    const dest = destinationsFor(st.draft, from);
    const p = getPlayerEra(st.draft.lineup[from]!);
    for (const [slot, d] of Object.entries(dest)) expect(d.rating).toBe(Math.round(assessSlot(p, getFormation("433").slots[Number(slot)]!.position).rating));
    const to = Number(Object.keys(dest)[0] ?? (from === 1 ? 2 : 1));
    st = reducer(st, { type: "TAP_SLOT", index: from });
    st = reducer(st, { type: "TAP_SLOT", index: to });
    if (st.phase !== "DRAFTING") throw new Error("phase");
    expect(st.draft.lineup[to]).toBe(p.id);
    // Position Draft keeps its slots fixed.
    let pd: GameState = { phase: "DRAFTING", run: { challenge: null, rival: null, startedAt: 0 }, draft: createDraft(cfg("pdseed", "position")), lastPick: null };
    pd = reducer(pd, { type: "PICK", optionIndex: 0 });
    const before = pd.phase === "DRAFTING" ? pd.draft.lineup.slice() : [];
    pd = reducer(pd, { type: "TAP_SLOT", index: before.findIndex(Boolean) });
    expect(pd.phase === "DRAFTING" && pd.selectedSlot == null).toBe(true);
  });

  it("OPTIMISE XI never makes the season worse, keeps the eleven, and flags real problems", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const s = playOut(createDraft(cfg(seed)));
      const players = new Set(s.lineup);
      const o = optimiseXI(s);
      if (!o) continue;
      expect(o.after.expected).toBeGreaterThanOrEqual(o.before.expected);
      const applied = applyProjection(s, o.after);
      expect(new Set(applied.lineup)).toEqual(players);
    }
    const bad = playOut(createDraft(cfg("badxi")), () => 0);
    const issues = healthCheck(bad);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("season model v4 calibration invariants", () => {
  const team = (over: Partial<TeamRatings> = {}): TeamRatings => ({
    att: 88, mid: 86, def: 85, gk: 87, overall: 87, fit: 92,
    dims: { width: 84, finishing: 90, creation: 89, progression: 84, retention: 86, coverage: 83, ballWinning: 84, pace: 85, aerial: 82, buildUp: 82 },
    outOfPosition: 0, overlap: 0, ...over,
  });
  const perfect = team({ att: 94, mid: 93, def: 92, gk: 93, overall: 93, fit: 98, dims: { width: 92, finishing: 95, creation: 95, progression: 92, retention: 93, coverage: 92, ballWinning: 92, pace: 92, aerial: 88, buildUp: 92 } });

  it("the exact expectation matches sampled seasons", () => {
    const seed = "calibseed";
    const e = expectedSeason(team(), seed, V);
    // Same league/fixtures, different luck: average many seasons with the same fixtures via a stable seed family is not
    // possible (luck is seeded), so compare the expectation with the mean over many seeds' own expectations instead.
    const sampled = Array.from({ length: 400 }, (_, i) => simulateSeason({ ratings: team(), seed: `calib${i}x`, engineVersion: V }).points);
    const exp = Array.from({ length: 400 }, (_, i) => expectedSeason(team(), `calib${i}x`, V).expected);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(mean(sampled) - mean(exp))).toBeLessThan(1.2);
    expect(e.pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(e.pmf[113]).toBe(0); // 113 is arithmetically impossible (3 per win, 1 per draw)
  });

  it("stronger never scores fewer on the same seed; FIT matters", () => {
    for (let i = 0; i < 30; i++) {
      const seed = `mono${i}seed`;
      const a = simulateSeason({ ratings: team(), seed, engineVersion: V }).points;
      const b = simulateSeason({ ratings: team({ att: 91, mid: 89, def: 88 }), seed, engineVersion: V }).points;
      expect(b).toBeGreaterThanOrEqual(a);
    }
    expect(expectedSeason(team({ fit: 70 }), "fitseed", V).expected).toBeLessThan(expectedSeason(team(), "fitseed", V).expected - 3);
  });

  it("114 is possible but mythic for a perfect XI, and rare for a strong one", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `myth${i}seed`);
    const p114 = seeds.map((s) => expectedSeason(perfect, s, V).atLeast(114));
    const avg = p114.reduce((a, b) => a + b, 0) / p114.length;
    expect(avg).toBeGreaterThan(0.01);
    expect(avg).toBeLessThan(0.2);
    const strong = seeds.map((s) => expectedSeason(team(), s, V).atLeast(114)).reduce((a, b) => a + b, 0) / seeds.length;
    expect(strong).toBeGreaterThan(0);
    expect(strong).toBeLessThan(0.002);
    let found = false;
    for (let i = 0; i < 300 && !found; i++) found = simulateSeason({ ratings: perfect, seed: `perfect${i}run`, engineVersion: V }).points === 114;
    expect(found).toBe(true);
  });
});

describe("analysis: turning points and practice replays", () => {
  it("turning points are real alternatives with positive estimated impact", () => {
    const s = playOut(createDraft(cfg("turnseed")), () => 0);
    const tps = turningPoints(s);
    expect(tps.length).toBeLessThanOrEqual(3);
    for (const t of tps) {
      expect(t.pts).toBeGreaterThan(0);
      const offer = s.shown?.[t.round - 1];
      expect(offer?.options).toContain(t.insteadId);
    }
  });

  it("replay from round n keeps the first n−1 decisions and the same next offer", () => {
    const s = playOut(createDraft(cfg("replayseed")), (st) => st.round % 3);
    const r = replayFrom(s, 8);
    expect(r.round).toBe(7);
    expect(r.picks.map((p) => p.playerEraId)).toEqual(s.picks.slice(0, 7).map((p) => p.playerEraId));
    expect(currentOffer(r)).toEqual(s.shown?.[7]);
  });
});

describe("modes browser", () => {
  it("Nations leads IDENTITY; World XI draws eleven different nations", () => {
    const identity = MODE_GROUPS.find((g) => g.id === "identity")!;
    expect(identity.entries[0]!.id).toBe("nations");
    expect(identity.entries.map((e) => e.id)).toContain("worldxi");
    for (const seed of SEEDS.slice(0, 10)) {
      const s = createDraft(cfg(seed, "worldxi"));
      const teams = s.draw.rounds.map((o) => getClubEra(o.clubEraId).clubId);
      expect(new Set(teams).size).toBe(11);
      for (const o of s.draw.rounds) expect(getClubEra(o.clubEraId).kind).toBe("nation");
    }
  });
});

describe("old links", () => {
  it("engine v3 drafts keep v3 behaviour (no director, no role relationships)", () => {
    const s = playOut(createDraft({ ...cfg("oldlinkseed"), engineVersion: "3" }));
    expect(s.shown).toBeUndefined();
    const r = replayDraft(s.config, s.picks.map((p) => p.optionIndex), null);
    expect(runSeason(r).points).toBe(runSeason(s).points);
    expect(draftRatings(s).synergies).toBeUndefined();
    void lineupPlayers;
    void arrangeFor;
  });
});

describe("i18n for V1.5", () => {
  it("every synergy, health issue, familiarity kind and attribute is translated", async () => {
    const { CATALOGS, LANGS, loadAllCatalogs } = await import("@/i18n");
    await loadAllCatalogs();
    const need = [
      ...["narrowLeft", "narrowRight", "narrow", "transition", "crosses", "slowLine", "buildUp", "partnership", "sameSpace", "falseNine", "noBallWinner"].flatMap((id) => [`synergy.${id}`, `synergy.${id}.short`]),
      ...["oop", "noKeeper", "critical", "transition", "width"].map((id) => `health.${id}`),
      ...["natural", "secondary", "twin", "near", "adjacent", "sameLine", "otherLine", "keeper"].map((k) => `inspect.kind.${k}`),
      ...["finishing", "creation", "progression", "retention", "defence", "pressing", "pace", "physical", "aerial", "buildUp", "goalkeeping", "distribution"].map((k) => `attr.${k}`),
      ...["above", "within", "below"].map((k) => `analysis.verdict.${k}`),
      ...MODE_GROUPS.map((g) => `modes.group.${g.id}`),
      "fitx.floor", "fitx.cap", "why.fitWeak", "why.fitLow",
    ];
    for (const lang of LANGS) for (const k of need) expect((CATALOGS[lang] as Record<string, string>)[k], `${lang} ${k}`).toBeTruthy();
  });
});
