import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  FORMATIONS,
  FORMATION_IDS,
  MAX_POINTS,
  ROUNDS,
  assessSlot,
  autoPlace,
  buildChallengePayload,
  canReroll,
  createDraft,
  createRng,
  currentOffer,
  decodeChallenge,
  draftRatings,
  encodeChallenge,
  generateDraw,
  getFormation,
  hungarian,
  isDraftComplete,
  lineupPlayers,
  parseChallengeToken,
  pickOption,
  positionFamiliarity,
  previewPlacement,
  rateLineup,
  replayDraft,
  reroll,
  runSeason,
  simulateSeason,
  swapSlots,
  validateFormation,
  type ChallengePayload,
} from "@/engine";
import { ALL_CLUB_ERAS, getPlayerEra } from "@/data";
import type { DraftConfig, DraftState, PlayerEra, TeamRatings } from "@/types";

const cfg = (seed: string, formation: DraftConfig["formation"] = "433"): DraftConfig => ({
  seed,
  formation,
  mode: "classic",
  engineVersion: ENGINE_VERSION,
});

function playOut(state: DraftState, choose: (s: DraftState, round: number) => number = () => 0): DraftState {
  let s = state;
  while (!isDraftComplete(s)) s = pickOption(s, choose(s, s.round)).state;
  return s;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => `seed${i}abc`);

describe("rng", () => {
  it("same seed reproduces the same sequence", () => {
    const a = createRng("hello");
    const b = createRng("hello");
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });
  it("different seeds diverge", () => {
    const a = createRng("hello");
    const b = createRng("hellp");
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(Array.from({ length: 5 }, () => b.next()));
  });
  it("stays in [0,1)", () => {
    const r = createRng("range");
    for (let i = 0; i < 5000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("data", () => {
  it("every club era can supply a keeper and a full offer", () => {
    for (const era of ALL_CLUB_ERAS) {
      const players = era.playerEraIds.map(getPlayerEra);
      expect(players.length).toBeGreaterThanOrEqual(10);
      expect(players.some((p) => p.positions[0] === "GK")).toBe(true);
    }
  });
});

describe("draft generation", () => {
  it("same seed → identical draw", () => {
    expect(generateDraw("abcdef12")).toEqual(generateDraw("abcdef12"));
  });
  it("different seeds → different draws", () => {
    const a = generateDraw("abcdef12");
    const b = generateDraw("zyxwvu98");
    expect(a.rounds.map((r) => r.clubEraId)).not.toEqual(b.rounds.map((r) => r.clubEraId));
  });
  it("has 11 rounds of 4 options plus a reserve", () => {
    for (const seed of SEEDS) {
      const d = generateDraw(seed);
      expect(d.rounds).toHaveLength(ROUNDS);
      for (const r of [...d.rounds, d.reserve]) expect(r.options).toHaveLength(4);
    }
  });
  it("never repeats a player anywhere in the draw", () => {
    for (const seed of SEEDS) {
      const d = generateDraw(seed);
      const ids = [...d.rounds, d.reserve].flatMap((r) => r.options.map((o) => getPlayerEra(o).playerId));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it("offers a keeper at least twice and mixes lines", () => {
    for (const seed of SEEDS) {
      const d = generateDraw(seed);
      const gkRounds = d.rounds.filter((r) => r.options.some((o) => getPlayerEra(o).positions[0] === "GK"));
      expect(gkRounds.length).toBeGreaterThanOrEqual(2);
      for (const r of d.rounds) {
        const naturals = new Set(r.options.map((o) => getPlayerEra(o).positions[0]));
        expect(naturals.size).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it("uses distinct club eras per draft", () => {
    for (const seed of SEEDS) {
      const d = generateDraw(seed);
      const eras = [...d.rounds, d.reserve].map((r) => r.clubEraId);
      expect(new Set(eras).size).toBe(eras.length);
    }
  });
});

describe("formations", () => {
  it("all formations are structurally valid", () => {
    for (const id of FORMATION_IDS) expect(validateFormation(FORMATIONS[id])).toEqual([]);
  });
});

describe("draft session", () => {
  it("completes after exactly 11 picks with a full, duplicate-free lineup", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      let s = createDraft(cfg(seed));
      for (let i = 0; i < ROUNDS; i++) {
        expect(isDraftComplete(s)).toBe(false);
        s = pickOption(s, i % 4).state;
      }
      expect(isDraftComplete(s)).toBe(true);
      expect(s.picks).toHaveLength(11);
      expect(s.lineup.every(Boolean)).toBe(true);
      const pids = lineupPlayers(s).map((p) => p?.playerId);
      expect(new Set(pids).size).toBe(11);
      expect(() => pickOption(s, 0)).toThrow();
    }
  });
  it("allows exactly one reroll", () => {
    let s = createDraft(cfg("rerollseed"));
    expect(canReroll(s)).toBe(true);
    const before = currentOffer(s);
    s = reroll(s);
    expect(currentOffer(s)).toEqual(s.draw.reserve);
    expect(currentOffer(s)).not.toEqual(before);
    expect(canReroll(s)).toBe(false);
    expect(() => reroll(s)).toThrow();
    s = pickOption(s, 0).state;
    expect(canReroll(s)).toBe(false);
    expect(() => reroll(s)).toThrow();
    expect(s.picks[0]?.rerolled).toBe(true);
  });
  it("rejects invalid option indexes", () => {
    const s = createDraft(cfg("badindex"));
    expect(() => pickOption(s, 4)).toThrow();
    expect(() => pickOption(s, -1)).toThrow();
    expect(() => pickOption(s, 1.5)).toThrow();
  });
});

describe("auto-placement", () => {
  const f = getFormation("433");
  const find = (name: string) => {
    for (const era of ALL_CLUB_ERAS) for (const id of era.playerEraIds) if (getPlayerEra(id).name === name) return getPlayerEra(id);
    throw new Error(name);
  };
  it("places players in their natural slot when free", () => {
    const empty = new Array(11).fill(null);
    const busquets = find("Busquets");
    const out = autoPlace(empty, busquets, f);
    expect(f.slots[out.findIndex((p) => p?.id === busquets.id)]?.position).toBe("DM");
    const keeper = find("Buffon");
    const out2 = autoPlace(out, keeper, f);
    expect(f.slots[out2.findIndex((p) => p?.id === keeper.id)]?.position).toBe("GK");
  });
  it("re-seats a versatile player to make room for a specialist", () => {
    // Lahm (RB/DM) first takes RB; Carvajal (RB only) arrives: Lahm shifts into midfield.
    let lineup = autoPlace(new Array(11).fill(null), find("Lahm"), f);
    const posOf = (name: string) => f.slots[lineup.findIndex((p) => p?.name === name)]?.position;
    expect(posOf("Lahm")).toBe("RB");
    lineup = autoPlace(lineup, find("Carvajal"), f);
    expect(posOf("Carvajal")).toBe("RB");
    expect(posOf("Lahm")).toBe("DM");
  });
  it("is never materially worse than dropping the newcomer into the best vacant slot", () => {
    const sum = (l: (PlayerEra | null)[]) =>
      l.reduce((a, p, i) => a + (p ? assessSlot(p, f.slots[i]!.position).rating : 0), 0);
    for (const seed of SEEDS.slice(0, 15)) {
      let s = createDraft(cfg(seed));
      while (!isDraftComplete(s)) {
        const before = lineupPlayers(s);
        const incoming = getPlayerEra(currentOffer(s)!.options[s.round % 4]!);
        const auto = sum(autoPlace(before, incoming, f));
        let bestNaive = -Infinity;
        before.forEach((p, i) => {
          if (p) return;
          const trial = before.slice();
          trial[i] = incoming;
          bestNaive = Math.max(bestNaive, sum(trial));
        });
        // Only stickiness/natural-position bonuses (≤ 4 per player) may trade off raw rating.
        expect(auto).toBeGreaterThanOrEqual(bestNaive - 4 * (s.round + 1));
        s = pickOption(s, s.round % 4).state;
      }
    }
  });
  it("outfielders avoid the GK slot while outfield slots remain", () => {
    let lineup: (PlayerEra | null)[] = new Array(11).fill(null);
    for (const n of ["Maldini", "Nesta", "Pirlo", "Kaká"]) lineup = autoPlace(lineup, find(n), f);
    expect(lineup[0]).toBeNull();
  });
  it("hungarian finds the optimal assignment", () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    expect(hungarian(cost)).toEqual([1, 0, 2]);
  });
});

describe("out-of-position handling", () => {
  it("familiarity tiers", () => {
    expect(positionFamiliarity(["CB"], "CB")).toBe(1);
    expect(positionFamiliarity(["CB", "RB"], "RB")).toBeGreaterThan(0.95);
    expect(positionFamiliarity(["LB"], "LWB")).toBeGreaterThan(0.9);
    expect(positionFamiliarity(["ST"], "CB")).toBeLessThan(0.6);
    expect(positionFamiliarity(["ST"], "GK")).toBeLessThan(0.2);
    expect(positionFamiliarity(["GK"], "ST")).toBeLessThan(0.2);
  });
  it("an out-of-position XI rates and fits worse than the same players arranged well", () => {
    const f = getFormation("433");
    const sensible = (st: DraftState) => [0, 1, 2, 3].find((i) => !previewPlacement(st, i)?.outOfPosition) ?? 0;
    const s = playOut(createDraft(cfg("oopcheck")), sensible);
    const good = lineupPlayers(s);
    const shuffled = good.slice();
    [shuffled[1], shuffled[9]] = [good[9] ?? null, good[1] ?? null]; // left-back ↔ striker
    const rGood = rateLineup(good, f);
    const rBad = rateLineup(shuffled, f);
    expect(rBad.outOfPosition).toBeGreaterThan(rGood.outOfPosition);
    expect(rBad.fit).toBeLessThan(rGood.fit);
    expect(rBad.overall).toBeLessThan(rGood.overall);
  });
  it("manual swaps are applied and change ratings", () => {
    const s = playOut(createDraft(cfg("swapcheck")));
    const swapped = swapSlots(s, 0, 9);
    expect(swapped.lineup[0]).toBe(s.lineup[9]);
    expect(swapped.lineup[9]).toBe(s.lineup[0]);
    const [a, b] = [draftRatings(swapped), draftRatings(s)];
    expect(a.fit <= b.fit && (a.fit < b.fit || a.overall < b.overall || a.gk !== b.gk)).toBe(true);
  });
});

describe("simulation", () => {
  const base = (over: Partial<TeamRatings> = {}): TeamRatings => ({
    att: 88,
    mid: 86,
    def: 85,
    gk: 88,
    overall: 87,
    fit: 90,
    dims: { width: 82, finishing: 90, creation: 89, progression: 82, retention: 85, coverage: 82, ballWinning: 84, pace: 84, aerial: 85, buildUp: 80 },
    outOfPosition: 0,
    overlap: 0,
    ...over,
  });

  it("W + D + L = 38 and points = 3W + D, always ≤ 114", () => {
    for (const seed of SEEDS) {
      for (const r of [base(), base({ att: 40, mid: 40, def: 40, gk: 40, fit: 30 }), base({ att: 99, mid: 99, def: 99, gk: 99, fit: 100 })]) {
        const res = simulateSeason({ ratings: r, seed, engineVersion: ENGINE_VERSION });
        expect(res.wins + res.draws + res.losses).toBe(38);
        expect(res.matchResults).toHaveLength(38);
        expect(res.points).toBe(res.wins * 3 + res.draws);
        expect(res.points).toBeLessThanOrEqual(MAX_POINTS);
        expect(res.points).toBeGreaterThanOrEqual(0);
        expect(res.goalsFor).toBe(res.matchResults.reduce((a, m) => a + m.goalsFor, 0));
      }
    }
  });
  it("maximum is exactly 114 and reachable by a dominant team", () => {
    const pts = ["dominant", "dominant2", "dominant3", "dominant4", "dominant5", "dominant6"].map(
      (seed) => simulateSeason({ ratings: base({ att: 160, mid: 160, def: 160, gk: 160, fit: 100 }), seed, engineVersion: ENGINE_VERSION }).points,
    );
    expect(MAX_POINTS).toBe(114);
    expect(Math.max(...pts)).toBe(114);
    expect(pts.every((p) => p <= 114 && p >= 105)).toBe(true);
  });
  it("is reproducible for identical inputs", () => {
    const a = simulateSeason({ ratings: base(), seed: "repro", engineVersion: ENGINE_VERSION });
    const b = simulateSeason({ ratings: base(), seed: "repro", engineVersion: ENGINE_VERSION });
    expect(a).toEqual(b);
  });
  it("varies across seeds", () => {
    const pts = new Set(SEEDS.map((seed) => simulateSeason({ ratings: base(), seed, engineVersion: ENGINE_VERSION }).points));
    expect(pts.size).toBeGreaterThan(5);
  });
  it("a stronger team never scores fewer points on the same seed (common random numbers)", () => {
    for (const seed of SEEDS) {
      const weak = simulateSeason({ ratings: base({ att: 80, def: 80 }), seed, engineVersion: ENGINE_VERSION });
      const strong = simulateSeason({ ratings: base({ att: 92, def: 92 }), seed, engineVersion: ENGINE_VERSION });
      expect(strong.points).toBeGreaterThanOrEqual(weak.points);
    }
  });
  it("rejects unknown engine versions", () => {
    expect(() => simulateSeason({ ratings: base(), seed: "x", engineVersion: "999" })).toThrow();
  });
});

describe("challenge protocol", () => {
  const finished = () => {
    let s = createDraft(cfg("chal1234", "4231"));
    s = pickOption(s, 1).state;
    s = reroll(s);
    s = playOut(s, (_, r) => r % 4);
    s = swapSlots(s, 7, 9);
    return s;
  };

  it("encodes and decodes to the same payload", () => {
    const s = finished();
    const result = runSeason(s);
    const payload = buildChallengePayload(s, result, "Florian");
    const token = encodeChallenge(payload);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parseChallengeToken(token)).toEqual(payload);
  });

  it("decoding rebuilds the creator's exact XI and verifies the score", () => {
    const s = finished();
    const result = runSeason(s);
    const token = encodeChallenge(buildChallengePayload(s, result, "Florian"));
    const decoded = decodeChallenge(token);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.challenge.creatorName).toBe("Florian");
    expect(decoded.challenge.creatorState.lineup).toEqual(s.lineup);
    expect(decoded.challenge.creatorResult.points).toBe(result.points);
    expect(decoded.challenge.creatorState.draw).toEqual(s.draw);
  });

  it("handles unicode names", () => {
    const s = finished();
    const token = encodeChallenge(buildChallengePayload(s, runSeason(s), "Zoë Çelik"));
    const d = decodeChallenge(token);
    expect(d.ok && d.challenge.creatorName).toBe("Zoë Çelik");
  });

  it("rejects malformed and hostile tokens", () => {
    for (const bad of ["", "!!!", "abc", "e30", "x".repeat(2000), "<script>alert(1)</script>"]) {
      expect(decodeChallenge(bad).ok).toBe(false);
    }
  });

  it("rejects payloads failing schema validation", () => {
    const s = finished();
    const good = buildChallengePayload(s, runSeason(s));
    const variants: Record<string, unknown>[] = [
      { ...good, sc: 115 },
      { ...good, f: "4411" },
      { ...good, p: "0123" },
      { ...good, r: 11 },
      { ...good, n: "<b>hax</b>" },
      { ...good, extra: 1 },
      { ...good, v: 2 },
    ];
    for (const v of variants) {
      const token = btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      expect(decodeChallenge(token).ok).toBe(false);
    }
  });

  it("rejects a tampered score", () => {
    const s = finished();
    const res = runSeason(s);
    const payload: ChallengePayload = { ...buildChallengePayload(s, res), sc: Math.min(114, res.points + 3) };
    const d = decodeChallenge(encodeChallenge(payload));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("score_mismatch");
  });

  it("rejects an invalid layout", () => {
    const s = finished();
    const payload: ChallengePayload = { ...buildChallengePayload(s, runSeason(s)), l: "00000000000" };
    const d = decodeChallenge(encodeChallenge(payload));
    expect(d.ok).toBe(false);
  });

  it("rejects outdated engine versions", () => {
    const s = finished();
    const payload: ChallengePayload = { ...buildChallengePayload(s, runSeason(s)), e: "0" };
    const d = decodeChallenge(encodeChallenge(payload));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("outdated");
  });
});

describe("full gameplay integration", () => {
  it("creator plays, challenges, challenger replays the same draft with different decisions", () => {
    // Creator
    let creator = createDraft(cfg("integrat", "433"));
    const seenByCreator = [] as string[][];
    while (!isDraftComplete(creator)) {
      if (creator.round === 5 && canReroll(creator)) creator = reroll(creator);
      seenByCreator.push([...(currentOffer(creator)?.options ?? [])]);
      creator = pickOption(creator, 0).state;
    }
    const creatorResult = runSeason(creator);
    expect(creatorResult.wins + creatorResult.draws + creatorResult.losses).toBe(38);
    const token = encodeChallenge(buildChallengePayload(creator, creatorResult, "Florian"));

    // Challenger opens the link
    const decoded = decodeChallenge(token);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const { payload } = decoded.challenge;
    let challenger = createDraft({ seed: payload.s, formation: payload.f, mode: payload.m, engineVersion: payload.e });

    // Same clubs and eras every round; identical shared offers in rounds 1–4. From round 5 the
    // Draft Director may tailor one option to each XI (engine v4), from the same squad.
    expect(challenger.draw).toEqual(creator.draw);
    while (!isDraftComplete(challenger)) {
      const offer = currentOffer(challenger)!;
      const base = challenger.draw.rounds[challenger.round]!;
      expect(offer.clubEraId).toBe(base.clubEraId);
      if (challenger.round < 4) expect(offer.options).toEqual(base.options);
      else expect(offer.options.filter((id) => base.options.includes(id)).length).toBeGreaterThanOrEqual(3);
      challenger = pickOption(challenger, 3).state;
    }
    const challengerResult = runSeason(challenger);

    // Replaying is deterministic
    const again = replayDraft(challenger.config, challenger.picks.map((p) => p.optionIndex), null);
    expect(runSeason(again)).toEqual(challengerResult);

    // Different decisions → different XI
    expect(challenger.lineup).not.toEqual(creator.lineup);
    expect(seenByCreator[0]).toEqual(creator.draw.rounds[0]?.options);
  });
});
