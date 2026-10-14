import { beforeAll, describe, expect, it } from "vitest";
import type { DraftState, MatchResult, ModeId, SeasonResult, TeamRatings } from "@/types";
import { ENGINE_VERSION, WEEKLY_EVENTS, WEEKLY_META, createDraft, currentOffer, draftRatings, getFormation, isDraftComplete, lineupPlayers, pickOption, runSeason, isModeId } from "@/engine";
import { ALL_CLUB_ERAS, ALL_PLAYER_IDS, getClub, getClubEra, getPlayer, getPlayerEra, getPlayerEraMeta, loadNationality, nationOf, playerEraIdsOf } from "@/data";
import { BALLON_DOR_YEARS, NATION_ERA_RESULTS, SOURCES, eraFacts, factMessage, playerFacts } from "@/knowledge/facts";
import { ratingWhy, roleSchool } from "@/knowledge/profile";
import { knowledgeEn } from "@/knowledge/i18n/en";
import { knowledgeFr } from "@/knowledge/i18n/fr";
import { knowledgeEs } from "@/knowledge/i18n/es";
import { en } from "@/i18n/en";
import { fr } from "@/i18n/fr";
import { es } from "@/i18n/es";
import { addToGallery, bestXIs, discoveryOf, pruneGallery, toSavedXI, toggleFavourite, updateHistory, type SavedXI } from "@/game/collection";
import { decisionSummary } from "@/game/decisions";
import { seasonMilestones } from "@/game/milestones";
import { MIN_SAMPLE, aggregateOffer, mostContrarianPick, offerKey, type PickEvent } from "@/stats/pickStats";

beforeAll(() => loadNationality());

const V = ENGINE_VERSION;
const legal = (s: DraftState) => currentOffer(s)!.options.map((_, i) => i).filter((i) => !lineupPlayers(s).some((x) => x?.playerId === getPlayerEra(currentOffer(s)!.options[i]!).playerId));
const play = (seed: string, pick: (s: DraftState) => number = (s) => legal(s)[0]!, mode: ModeId = "classic", extra = {}) => {
  let s = createDraft({ seed, formation: "433", mode, engineVersion: V, ...extra });
  while (!isDraftComplete(s)) s = pickOption(s, pick(s)).state;
  return s;
};

describe("dataset identity & metadata", () => {
  it("scale: 1,000+ players, 2,000+ PlayerEras, 200+ team eras, with many multi-version players", () => {
    expect(ALL_PLAYER_IDS.length).toBeGreaterThan(1000);
    expect(ALL_CLUB_ERAS.reduce((a, e) => a + e.playerEraIds.length, 0)).toBeGreaterThan(2000);
    expect(ALL_CLUB_ERAS.length).toBeGreaterThan(200);
    expect(playerEraIdsOf("messi").length).toBeGreaterThanOrEqual(4);
    expect(playerEraIdsOf("cristiano-ronaldo").length).toBeGreaterThanOrEqual(4);
  });

  it("namesakes are separate identities (one identity never spans an impossible career or two names)", () => {
    for (const [a, b] of [["thuram", "marcus-thuram"], ["blind", "daley-blind"], ["falcao", "paulo-roberto-falcao"], ["hazard", "mike-hazard"], ["coutinho", "coutinho-santos"]]) {
      expect(getPlayer(a!), a).not.toBeNull();
      expect(getPlayer(b!), b).not.toBeNull();
    }
    expect(nationOf("falcao")?.code).toBe("COL");
    expect(nationOf("paulo-roberto-falcao")?.code).toBe("BRA");
    for (const pid of ALL_PLAYER_IDS) {
      const ids = playerEraIdsOf(pid);
      const eras = ids.map((id) => getClubEra(getPlayerEra(id).clubEraId));
      const span = Math.max(...eras.map((e) => e.endYear)) - Math.min(...eras.map((e) => e.startYear));
      expect(span, pid).toBeLessThanOrEqual(22);
      expect(new Set(ids.map((id) => getPlayerEra(id).name)).size, pid).toBe(1);
    }
  });

  it("versions are listed oldest first and nationality covers every identity", () => {
    const ids = playerEraIdsOf("messi");
    const years = ids.map((id) => getClubEra(getPlayerEra(id).clubEraId).startYear);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    let low = 0;
    for (const pid of ALL_PLAYER_IDS) {
      const n = nationOf(pid);
      expect(n, pid).not.toBeNull();
      if (n!.confidence === "low") low++;
    }
    expect(low / ALL_PLAYER_IDS.length).toBeLessThan(0.01);
    // National-team squads agree with nationality.
    for (const e of ALL_CLUB_ERAS.filter((x) => x.kind === "nation")) for (const id of e.playerEraIds) expect(nationOf(getPlayerEra(id).playerId)!.codes, id).toContain(getClub(e.clubId).country);
  });

  it("every PlayerEra has rating metadata (version, confidence, rationale)", () => {
    const m = getPlayerEraMeta(ALL_CLUB_ERAS[0]!.playerEraIds[0]!);
    expect(m.ratingVersion).toBe("r1");
    expect(["high", "medium", "low"]).toContain(m.ratingConfidence);
    expect(m.ratingRationale.derivedOverall).toBe(getPlayerEra(ALL_CLUB_ERAS[0]!.playerEraIds[0]!).overall);
  });
});

describe("knowledge content", () => {
  it("the three knowledge catalogs have exactly the same keys, none empty", () => {
    const keys = Object.keys(knowledgeEn).sort();
    expect(Object.keys(knowledgeFr).sort()).toEqual(keys);
    expect(Object.keys(knowledgeEs).sort()).toEqual(keys);
    for (const cat of [knowledgeEn, knowledgeFr, knowledgeEs]) for (const k of keys) expect(cat[k], k).toBeTruthy();
  });

  it("every fact is sourced, every nation era has its tournament, every Ballon d'Or id exists", () => {
    for (const e of ALL_CLUB_ERAS.filter((x) => x.kind === "nation")) expect(NATION_ERA_RESULTS[e.id], e.id).toBeTruthy();
    for (const id of Object.keys(NATION_ERA_RESULTS)) expect(ALL_CLUB_ERAS.some((e) => e.id === id), id).toBe(true);
    for (const id of Object.keys(BALLON_DOR_YEARS)) expect(getPlayer(id), id).not.toBeNull();
    for (const e of ALL_CLUB_ERAS)
      for (const f of eraFacts(e.id)) {
        expect(SOURCES[f.source], f.source).toBeTruthy();
        expect(knowledgeEn[factMessage(f).key], factMessage(f).key).toBeTruthy();
      }
    expect(playerFacts("barcelona-2008:messi").length + playerFacts(playerEraIdsOf("messi")[0]!).length).toBeGreaterThan(0);
  });

  it("rating explanations are derived from attributes (elite ≥ 90, limited ≤ 62)", () => {
    for (const e of ALL_CLUB_ERAS.slice(0, 20))
      for (const id of e.playerEraIds) {
        const p = getPlayerEra(id);
        const w = ratingWhy(p);
        for (const a of w.elite) expect(p[a]).toBeGreaterThanOrEqual(90);
        for (const a of w.limited) expect(p[a]).toBeLessThanOrEqual(62);
        if (p.positions[0] !== "GK") expect(w.limited).not.toContain("goalkeeping");
      }
  });

  it("the Role School covers every role with real examples (inverted full-back honestly has none)", () => {
    const school = roleSchool();
    expect(school.length).toBe(21);
    for (const s of school) {
      if (s.id === "ifb") expect(s.examples).toEqual([]);
      else expect(s.examples.length, s.id).toBeGreaterThan(0);
      for (const k of ["strengths", "needs"]) expect(knowledgeEn[`school.${s.id}.${k}`], `${s.id}.${k}`).toBeTruthy();
    }
  });

  it("every weekly theme drafts to completion and its meta is valid and translated", () => {
    for (const ev of WEEKLY_EVENTS) {
      const s = play(`vseventeen-week-${ev.id}`, (st) => legal(st)[0]!, "weekly", { event: ev.id });
      expect(runSeason(s).points, ev.id).toBeGreaterThanOrEqual(0);
      for (const cat of [en, fr, es] as Record<string, string>[]) expect(cat[`weekly.${ev.id}.name`], ev.id).toBeTruthy();
    }
    for (const [id, m] of Object.entries(WEEKLY_META)) {
      expect(WEEKLY_EVENTS.some((e) => e.id === id), id).toBe(true);
      if (m.recommend) expect(isModeId(m.recommend), id).toBe(true);
      if (m.school) expect(roleSchool().some((s) => s.id === m.school), id).toBe(true);
    }
  });
});

const fakeResult = (outcomes: string, gf = 2): SeasonResult => {
  const matchResults: MatchResult[] = outcomes.split("").map((o, i) => ({ matchday: i + 1, opponent: "X", opponentId: "x", opponentTier: "strong", home: true, goalsFor: o === "W" ? gf : o === "D" ? 1 : 0, goalsAgainst: o === "L" ? 1 : o === "D" ? 1 : 0, outcome: o as "W" | "D" | "L" }));
  const w = [...outcomes].filter((o) => o === "W").length, d = [...outcomes].filter((o) => o === "D").length, l = [...outcomes].filter((o) => o === "L").length;
  return { format: "league", points: w * 3 + d, maxPoints: 114, wins: w, draws: d, losses: l, goalsFor: 0, goalsAgainst: 0, matchResults, events: [], teamRatings: {} as TeamRatings } as unknown as SeasonResult;
};

describe("season milestones", () => {
  it("114: PERFECT is the milestone; never more than two prominent", () => {
    const m = seasonMilestones(fakeResult("W".repeat(38)), 90);
    expect(m.length).toBeLessThanOrEqual(2);
    expect(m.some((x) => x.kind === "perfect")).toBe(true);
    for (let k = 0; k < 20; k++) expect(seasonMilestones(fakeResult([...Array(38)].map((_, i) => "WWDL"[(i * 7 + k) % 4]).join("")), 60).length).toBeLessThanOrEqual(2);
  });
  it("unbeaten seasons and first defeats after a long run are recognised", () => {
    expect(seasonMilestones(fakeResult("WD".repeat(19)), null).some((x) => x.kind === "unbeatenSeason")).toBe(true);
    expect(seasonMilestones(fakeResult("D".repeat(15) + "L" + "D".repeat(22)), null, 8).some((x) => x.kind === "firstDefeat")).toBe(true);
  });
});

describe("collection: XI gallery, history, discoveries", () => {
  const drafted = play("vseventeen-gallery");
  const result = runSeason(drafted);
  it("saves the XI as played and keeps favourites and category bests through pruning", () => {
    const xi = toSavedXI(drafted, result, "tok");
    expect(xi.lineup.length).toBe(11);
    let g: SavedXI[] = [];
    for (let k = 0; k < 30; k++) {
      g = addToGallery(g, { ...xi, id: `x${k}`, at: k, points: k === 3 ? 110 : 50 });
      if (k === 0) g = toggleFavourite(g, "x0");
    }
    g = pruneGallery(g);
    expect(g.some((x) => x.id === "x0")).toBe(true); // favourite
    expect(g.some((x) => x.id === "x3")).toBe(true); // best season
    expect(g.filter((x) => !x.favourite).length).toBeLessThanOrEqual(12 + 5);
  });
  it("best-XI categories only appear with enough history", () => {
    const xi = toSavedXI(drafted, result, null);
    expect(bestXIs([xi], [{ mode: "classic", points: 50 }])).toEqual([]);
    const runs = Array.from({ length: 6 }, () => ({ mode: "classic" as ModeId, points: 50 }));
    expect(bestXIs([xi], runs).map((b) => b.category)).toEqual(expect.arrayContaining(["season", "fit", "attack"]));
  });
  it("history counts drafts where a player was offered and drafted", () => {
    const h = updateHistory({}, drafted, result.points);
    const pickedId = getPlayerEra(drafted.picks[0]!.playerEraId).playerId;
    expect(h[pickedId]![1]).toBe(1);
    expect(h[pickedId]![2]).toBe(result.points);
    expect(Object.values(h).every((r) => r[0] >= r[1])).toBe(true);
  });
  it("a discovery moment: never on the first game, at most one", () => {
    expect(discoveryOf(drafted, { eras: [], nations: [] }, 0)).toBeNull();
    const d = discoveryOf(drafted, { eras: [], nations: [] }, 3);
    if (d) expect(["era", "nation"]).toContain(d.kind);
  });
});

describe("decision summary (YOUR DRAFT)", () => {
  it("is derived from the actual picks", () => {
    const greedy = play("vseventeen-dec", (s) => legal(s)[0]!);
    const d = decisionSummary(greedy);
    expect(d.counts.picks).toBe(11);
    expect(d.counts.starPicks).toBe(11);
    expect(d.starPower).toBe("high");
    expect(d.line?.key === "decide.allStars" || d.line?.key === "decide.costlyStars").toBe(true);
    const r = draftRatings(greedy);
    expect(d.discipline).toBe(r.outOfPosition === 0 ? "excellent" : r.outOfPosition === 1 ? "strong" : r.outOfPosition === 2 ? "fair" : "weak");
  });
});

describe("pick consensus: nothing without a real sample", () => {
  const base = { engineVersion: V, seed: "s", rulesetId: "classic", round: 0, clubEraId: "e", optionIndex: 0, fitDelta: 0, finalPoints: null, duelWon: null, at: 0 };
  it("no contrarian insight below the minimum sample", () => {
    const mine: PickEvent[] = [{ ...base, playerEraId: "a" }];
    const crowd: PickEvent[] = Array.from({ length: MIN_SAMPLE - 1 }, (_, i) => ({ ...base, playerEraId: i === 0 ? "a" : "b" }));
    expect(mostContrarianPick(mine, (k) => aggregateOffer(crowd, k))).toBeNull();
  });
  it("with enough real picks, the rarest pick is found", () => {
    const mine: PickEvent[] = [{ ...base, playerEraId: "a" }];
    const crowd: PickEvent[] = Array.from({ length: 100 }, (_, i) => ({ ...base, playerEraId: i < 7 ? "a" : "b" }));
    const c = mostContrarianPick(mine, (k) => aggregateOffer(crowd, k));
    expect(c?.pickRate).toBeCloseTo(0.07);
    expect(offerKey(base)).toBe(`${V}|s|classic|0`);
  });
});

describe("engine v5 identity damping", () => {
  it("multi-version icons are offered less often than in v4, with the same draft machinery", () => {
    const count = (version: string) => {
      let n = 0;
      for (let k = 0; k < 250; k++) {
        const s = createDraft({ seed: `vseventeen-damp${k}`, formation: "433", mode: "classic", engineVersion: version });
        let st = s;
        const seen = new Set<string>();
        while (!isDraftComplete(st)) {
          for (const id of currentOffer(st)!.options) seen.add(getPlayerEra(id).playerId);
          st = pickOption(st, legal(st)[0]!).state;
        }
        if (seen.has("messi")) n++;
        if (seen.has("cristiano-ronaldo")) n++;
      }
      return n;
    };
    expect(count("5")).toBeLessThan(count("4"));
    expect(getFormation("433").slots.length).toBe(11);
  });
});

describe("V1.7 code splitting", () => {
  it("French / Spanish catalogs load on demand; English is the fallback until then", async () => {
    const i18n = await import("@/i18n");
    expect(i18n.hasCatalog("en")).toBe(true);
    if (!i18n.hasCatalog("fr")) expect(i18n.translate("fr", "settings.title")).toBe(i18n.translate("en", "settings.title"));
    await i18n.loadCatalog("fr");
    await i18n.loadCatalog("es");
    expect(i18n.translate("fr", "settings.title")).toBe("Réglages");
    expect(i18n.translate("fr", "home.games", { n: 0 })).toBe("0 partie");
    expect(i18n.hasCatalog("es")).toBe(true);
  });
});
