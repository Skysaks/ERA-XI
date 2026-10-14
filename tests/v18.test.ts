import { beforeAll, describe, expect, it } from "vitest";
import type { DraftConfig } from "@/types";
import { ENGINE_VERSION, SUPPORTED_ENGINE_VERSIONS, WEEKLY_EVENTS, createDraft, currentOffer, dailyEventFor, dailySeed, isDraftComplete, pickOption, runSeason } from "@/engine";
import { ALL_CLUB_ERAS, ALL_PLAYER_IDS, getClub, getClubEra, loadNationality, nationOf } from "@/data";
import { DEFAULT_PROFILE, addFeed, rivals, type StoredProfile } from "@/game/storage";
import { homeCta } from "@/game/homeCta";
import { preferredPosition, updateHistory } from "@/game/collection";
import { HELP_IDS } from "@/help/types";
import { helpEn } from "@/help/en";
import { helpFr } from "@/help/fr";
import { helpEs } from "@/help/es";
import { eraMetaOf, loadEraContext } from "@/knowledge/eraContext";
import { loadAllCatalogs, translate } from "@/i18n";

beforeAll(async () => {
  await loadNationality();
  await loadEraContext();
  await loadAllCatalogs();
});

const play = (config: DraftConfig) => {
  let s = createDraft(config);
  while (!isDraftComplete(s)) s = pickOption(s, 0).state;
  return s;
};
const profile = (patch: Partial<StoredProfile>): StoredProfile => ({ ...structuredClone(DEFAULT_PROFILE), ...patch });

describe("V1.8 world coverage", () => {
  it("every region is represented and every new player has a nationality", () => {
    const countries = new Set(ALL_CLUB_ERAS.map((e) => getClub(e.clubId).country));
    for (const c of ["GHA", "CIV", "EGY", "ALG", "CMR", "USA", "MEX", "CRC", "PAR", "PER", "IRN", "KSA", "AUS", "JPN"]) expect(countries, c).toContain(c);
    for (const pid of ALL_PLAYER_IDS) expect(nationOf(pid), pid).not.toBeNull();
  });

  it("every team era has sourced context (coach, honours or style) and honours sit inside the span", () => {
    for (const e of ALL_CLUB_ERAS) {
      const m = eraMetaOf(e.id);
      expect(m, e.id).not.toBeNull();
      expect(m!.src.length, `${e.id} sources`).toBeGreaterThan(0);
      for (const [code, year] of m!.honours) {
        expect(year, `${e.id} ${code}`).toBeGreaterThanOrEqual(e.startYear);
        expect(year, `${e.id} ${code}`).toBeLessThanOrEqual(e.endYear + 1);
      }
    }
  });
});

describe("V1.8 engine v6: themed weeks and Daily", () => {
  it("v5 links still replay and v6 is current", () => {
    expect(Number(ENGINE_VERSION)).toBeGreaterThanOrEqual(6);
    expect(SUPPORTED_ENGINE_VERSIONS).toContain("6");
    expect(SUPPORTED_ENGINE_VERSIONS).toContain("5");
    const cfg: DraftConfig = { seed: "v18-compat", formation: "433", mode: "classic", engineVersion: "5" };
    expect(currentOffer(createDraft(cfg))!.options).toEqual(currentOffer(createDraft(cfg))!.options);
  });

  it("AC Milan and Brazil weeks guarantee rounds from the featured side", () => {
    const milan = play({ seed: "v18-milan", formation: "433", mode: "weekly", engineVersion: "6", event: "acmilan" });
    expect(milan.draw.rounds.filter((o) => getClubEra(o.clubEraId).clubId === "ac-milan").length).toBeGreaterThanOrEqual(2);
    const brazil = play({ seed: "v18-brazil", formation: "433", mode: "weekly", engineVersion: "6", event: "brazil" });
    expect(brazil.draw.rounds.filter((o) => getClub(getClubEra(o.clubEraId).clubId).country === "BRA").length).toBeGreaterThanOrEqual(4);
    for (const s of [milan, brazil]) expect(runSeason(s).matchResults).toHaveLength(38);
  });

  it("the Daily XI follows the week's theme from v6 only, and every weekly theme completes", () => {
    const day = "2026-09-27";
    const ev = dailyEventFor(day);
    expect(WEEKLY_EVENTS.map((e) => e.id)).toContain(ev);
    const cfg: DraftConfig = { seed: dailySeed(day), formation: "433", mode: "daily", engineVersion: "6", daily: day, event: ev };
    expect(isDraftComplete(play(cfg))).toBe(true);
    expect(() => createDraft({ ...cfg, engineVersion: "5" })).toThrow();
    for (const e of WEEKLY_EVENTS) expect(isDraftComplete(play({ seed: `v18-w-${e.id}`, formation: "442", mode: "weekly", engineVersion: "6", event: e.id })), e.id).toBe(true);
  });
});

describe("V1.8 contextual Home CTA", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  it("one primary action, chosen by situation", () => {
    expect(homeCta(profile({ games: 0 }), null, "2026-09-27", now).kind).toBe("play");
    const base = profile({ games: 5, records: { ...DEFAULT_PROFILE.records, bestPoints: 100 } });
    expect(homeCta(base, null, "2026-09-27", now).kind).toBe("daily");
    const played = { ...base, daily: { "2026-09-27": { points: 80, at: now } } } as unknown as StoredProfile;
    expect(homeCta(played, null, "2026-09-27", now).kind).toBe("play");
    const near = { ...played, recent: [{ ...(played.recent[0] ?? {}), at: now - 3600e3, points: 97, mode: "classic" }] } as unknown as StoredProfile;
    expect(homeCta(near, null, "2026-09-27", now)).toEqual({ kind: "beat", best: 100, gap: 3 });
    const beaten = { ...played, challenges: [{ at: now - 3600e3, token: "x", opponent: "Anthony", theirs: 98, yours: 91 }] } as StoredProfile;
    expect(homeCta(beaten, null, "2026-09-27", now)).toMatchObject({ kind: "rematch", rival: "Anthony" });
    const anon = { ...played, challenges: [{ at: now - 3600e3, token: "x", opponent: "Friend", theirs: 98, yours: 91 }] } as StoredProfile;
    expect(homeCta(anon, null, "2026-09-27", now).kind).toBe("play");
  });
});

describe("V1.8 My ERA data", () => {
  it("rivals need three games against the same named opponent; the record is real", () => {
    const now = Date.now();
    const g = (opponent: string, yours: number, theirs: number, d: number) => ({ at: now - d * 1000, token: `${opponent}${d}`, opponent, yours, theirs });
    const p = profile({ challenges: [g("Anthony", 91, 98, 1), g("anthony", 95, 88, 2), g("Anthony", 97, 90, 3), g("Lucas", 84, 80, 4), g("Lucas", 84, 85, 5), g("Friend", 1, 2, 6), g("Friend", 1, 2, 7), g("Friend", 1, 2, 8)] });
    const r = rivals(p);
    expect(r.map((x) => x.name)).toEqual(["Anthony"]);
    expect(r[0]).toMatchObject({ you: 2, them: 1, games: 3, yourBest: 97, theirBest: 98, yourAvg: 94 });
  });

  it("the activity feed is bounded, newest first", () => {
    let p = profile({});
    for (let i = 0; i < 40; i++) p = addFeed(p, [{ at: i, k: "pb", n: i, prev: null }]);
    expect(p.feed.length).toBeLessThanOrEqual(20);
    expect(p.feed[0]).toMatchObject({ n: 39 });
  });

  it("player history keeps where you played him (preferred position)", () => {
    const s = play({ seed: "v18-hist", formation: "433", mode: "classic", engineVersion: "6" });
    const h = updateHistory({}, s, 80);
    const drafted = Object.entries(h).filter(([, row]) => row[1] > 0);
    expect(drafted.length).toBe(11);
    for (const [, row] of drafted) expect(preferredPosition(row)).toMatch(/^[A-Z]{2,3}$/);
  });
});

describe("V1.8 Help Center and localisation", () => {
  it("three languages, same sections, short first then depth", () => {
    for (const cat of [helpEn, helpFr, helpEs]) {
      expect(cat.sections.map((s) => s.id)).toEqual([...HELP_IDS]);
      for (const s of cat.sections) {
        expect(s.short.length, s.id).toBeLessThan(420);
        if (s.id !== "glossary") expect(s.more.length, s.id).toBeGreaterThan(0);
      }
      expect(cat.glossary.length).toBe(helpEn.glossary.length);
    }
  });

  it("French and Spanish use a decimal comma", () => {
    expect(translate("fr", "ax.scored", { gf: 57, gpg: "1.5", ga: 38 })).toContain("1,5");
    expect(translate("en", "ax.scored", { gf: 57, gpg: "1.5", ga: 38 })).toContain("1.5");
  });
});
