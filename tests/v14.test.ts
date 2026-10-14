import { beforeAll, describe, expect, it } from "vitest";
import type { DraftConfig, DraftState, ModeId } from "@/types";
import {
  ENGINE_VERSION,
  MODE_GROUPS,
  RULESETS,
  WEEKLY_EVENTS,
  BALLON_DOR_WINNERS,
  buildChallengePayload,
  createDraft,
  currentEvent,
  currentOffer,
  decodeChallenge,
  draftRatings,
  encodeChallenge,
  isDraftComplete,
  labReplace,
  lineupPlayers,
  oneLeagueIds,
  pickOption,
  reroll,
  runSeason,
  seededLeague,
  verdictMsgs,
  weekStart,
  worthReconsidering,
} from "@/engine";
import { getClub, getClubEra, getPlayerEra, playerIdOf } from "@/data";
import { en, formatMsg, CATALOGS, LANGS, loadAllCatalogs } from "@/i18n";
import { restoreDraft, toResume } from "@/game/resume";
import { formDots, currentStreak, addActivity, localDay } from "@/game/form";
import { ACHIEVEMENTS, newlyUnlocked } from "@/game/achievements";
import { DNA_MIN_GAMES, draftDNA, runDNA } from "@/game/dna";
import { DEFAULT_SETTINGS, effectiveSettings, sanitizeSettings } from "@/game/settings";
import { DEFAULT_PROFILE, recordRun } from "@/game/storage";
import { ERA_PLUS, FORBIDDEN, FREE, canPlayReceivedChallenge, has } from "@/platform/entitlements";
import { SPONSORS, sponsorFor, type SponsorSlot } from "@/platform/sponsor";
import { INSTALL_AFTER_GAMES, shouldSuggestInstall } from "@/platform/install";
import { PUSH_AVAILABLE, requestInContext } from "@/platform/notifications";
import manifest from "@/app/manifest";

beforeAll(() => loadAllCatalogs());

const SEEDS = Array.from({ length: 30 }, (_, i) => `v14seed${i}`);
const cfg = (seed: string, mode: ModeId, extra: Partial<DraftConfig> = {}): DraftConfig => ({ seed, formation: "433", mode, engineVersion: ENGINE_VERSION, ...extra });

function playOut(s: DraftState): DraftState {
  let st = s;
  while (!isDraftComplete(st)) {
    const offer = currentOffer(st)!;
    const taken = new Set(lineupPlayers(st).filter(Boolean).map((p) => p!.playerId));
    const idx = offer.options.findIndex((id) => !taken.has(getPlayerEra(id).playerId));
    st = pickOption(st, Math.max(0, idx)).state;
  }
  return st;
}

describe("weekly events", () => {
  it("rotate by ISO week with Monday–Sunday windows, deterministic", () => {
    const a = currentEvent(new Date("2026-09-23T10:00:00Z"));
    const b = currentEvent(new Date("2026-09-27T23:00:00Z"));
    expect(a.event.id).toBe(b.event.id);
    expect(a.start).toBe("2026-09-21");
    expect(a.end).toBe("2026-09-27");
    const next = currentEvent(new Date("2026-09-28T01:00:00Z"));
    expect(next.event.id).not.toBe(a.event.id);
    expect(weekStart(new Date("2026-09-21T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-21");
  });

  it("every event drafts on the core engine and respects its theme", () => {
    for (const ev of WEEKLY_EVENTS) {
      for (const seed of SEEDS.slice(0, 12)) {
        const s = createDraft(cfg(seed, "weekly", { event: ev.id }));
        const offers = [...s.draw.rounds, s.draw.reserve];
        for (const o of offers) {
          const era = getClubEra(o.clubEraId);
          if (ev.id === "the2000s") expect(era.bucket).toBe("2000s");
          if (ev.id === "southamerica") expect(["BRA", "ARG", "URU"]).toContain(getClub(era.clubId).country);
          if (ev.id === "england") expect(getClub(era.clubId).country).toBe("ENG");
          if (ev.id === "champions") expect(era.europeanCups.length).toBeGreaterThan(0);
          if (ev.id === "noballondor") for (const id of o.options) expect(BALLON_DOR_WINNERS).not.toContain(playerIdOf(id));
        }
        const done = playOut(s);
        expect(runSeason(done).points).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("weekly needs a known event; other modes refuse one", () => {
    expect(() => createDraft(cfg("x-weekly-1", "weekly"))).toThrow();
    expect(() => createDraft(cfg("x-weekly-2", "classic", { event: "the2000s" }))).toThrow();
  });

  it("a weekly challenge link carries its event and replays", () => {
    const s = playOut(createDraft(cfg("weeklylinkseed", "weekly", { event: "southamerica" })));
    const r = runSeason(s);
    const d = decodeChallenge(encodeChallenge(buildChallengePayload(s, r, "Ana")));
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.challenge.payload.w).toBe("southamerica");
      expect(d.challenge.creatorResult.points).toBe(r.points);
    }
  });
});

describe("one league", () => {
  it("offers the five big leagues and draws only from the chosen country", () => {
    expect(oneLeagueIds().sort()).toEqual(["ENG", "ESP", "FRA", "GER", "ITA"]);
    for (const seed of SEEDS.slice(0, 10)) {
      const random = createDraft(cfg(seed, "oneleague"));
      expect(random.draw.league).toBe(seededLeague(seed, ENGINE_VERSION));
      const s = createDraft(cfg(seed, "oneleague", { choice: { league: "ITA" } }));
      for (const o of [...s.draw.rounds, s.draw.reserve]) {
        const era = getClubEra(o.clubEraId);
        expect(era.kind).toBe("club");
        expect(getClub(era.clubId).country).toBe("ITA");
      }
    }
  });
});

describe("resume", () => {
  it("restores an unfinished draft exactly (picks, reroll, layout)", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      let s = createDraft(cfg(seed, "classic"));
      for (let i = 0; i < 6; i++) {
        if (i === 3) s = reroll(s);
        s = pickOption(s, i % 3).state;
      }
      const back = restoreDraft(toResume(s, { challengeToken: null, rival: null, startedAt: 1 }))!;
      expect(back.round).toBe(6);
      expect(back.picks.map((p) => p.playerEraId)).toEqual(s.picks.map((p) => p.playerEraId));
      expect(back.lineup).toEqual(s.lineup);
      expect(back.rerollRound).toBe(3);
    }
  });

  it("restores a reroll taken but not yet used", () => {
    let s = createDraft(cfg("resume-reroll", "classic"));
    s = pickOption(s, 0).state;
    s = reroll(s);
    const back = restoreDraft(toResume(s, { challengeToken: null, rival: null, startedAt: 1 }))!;
    expect(currentOffer(back)!.clubEraId).toBe(currentOffer(s)!.clubEraId);
  });

  it("keeps a manual swap on a complete XI", () => {
    const s = playOut(createDraft(cfg("resume-swap", "classic")));
    const swapped: DraftState = { ...s, lineup: [s.lineup[1]!, s.lineup[0]!, ...s.lineup.slice(2)] };
    const back = restoreDraft(toResume(swapped, { challengeToken: null, rival: null, startedAt: 1 }))!;
    expect(back.lineup).toEqual(swapped.lineup);
  });

  it("a broken record returns null instead of throwing", () => {
    const rec = toResume(createDraft(cfg("resume-bad", "classic")), { challengeToken: null, rival: null, startedAt: 1 });
    expect(restoreDraft({ ...rec, picks: [9, 9, 9] })).toBeNull();
  });
});

describe("form, achievements, DNA", () => {
  it("FORM counts active days of the last seven; a missed day costs one dot", () => {
    const now = new Date(2026, 8, 23, 12);
    const day = (d: number) => localDay(new Date(2026, 8, d, 12));
    let days: string[] = [];
    for (const d of [17, 18, 19, 21, 22]) days = addActivity(days, day(d));
    const dots = formDots(days, now);
    expect(dots).toEqual([true, true, true, false, true, true, false]);
    expect(dots.filter(Boolean).length).toBe(5);
    expect(currentStreak(days, now)).toBe(2);
    expect(addActivity(days, day(22))).toEqual(days);
  });

  it("achievements are rare, earned once, and never from gauntlet points in league tests", () => {
    const s = playOut(createDraft(cfg("ach-seed", "classic")));
    const r = runSeason(s);
    const fake = { ...r, points: 114, losses: 0 };
    const got = newlyUnlocked({}, { mode: "classic", result: fake, rerollUsed: false, rerollsAvailable: 1 });
    expect(got).toEqual(expect.arrayContaining(["centurion", "almostperfect", "perfection", "invincible", "nosecondchance"]));
    expect(got).not.toContain("purist");
    expect(newlyUnlocked(Object.fromEntries(got.map((g) => [g, 1])), { mode: "classic", result: fake, rerollUsed: false, rerollsAvailable: 1 })).toEqual([]);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(10);
    const out = recordRun(DEFAULT_PROFILE, { at: 1, seed: "x", points: 102, wins: 30, draws: 12, losses: 0, formation: "433", mode: "iq", overall: 80, fit: 80, rerollUsed: true }, { ...r, points: 102, losses: 0 });
    expect(out.achievements).toContain("purist");
    expect(out.achievements).not.toContain("nosecondchance");
    expect(out.profile.records.hundreds).toBe(1);
    expect(out.profile.records.unbeaten).toBe(1);
    expect(out.profile.activity.length).toBe(1);
  });

  it("Draft DNA is measured from real picks and hidden below 20 games", () => {
    const runs = SEEDS.slice(0, DNA_MIN_GAMES).map((seed) => runDNA(playOut(createDraft(cfg(seed, "classic")))));
    for (const r of runs) {
      expect(r.starBias).toBeGreaterThanOrEqual(0);
      expect(r.starBias).toBeLessThanOrEqual(1);
      expect(r.contrarianRate).toBeNull(); // needs crowd data — never guessed
    }
    expect(draftDNA(runs.slice(0, DNA_MIN_GAMES - 1))).toBeNull();
    const dna = draftDNA(runs)!;
    expect(dna.games).toBe(DNA_MIN_GAMES);
    // Same decisions → same profile (never random).
    expect(draftDNA(runs)).toEqual(dna);
  });
});

describe("post-game learning & Draft Lab", () => {
  it("verdict lines come from the tactical dimensions", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const r = runSeason(playOut(createDraft(cfg(seed, "classic"))));
      const v = verdictMsgs(r);
      expect(v.length).toBeLessThanOrEqual(2);
      for (const m of v) for (const lang of LANGS) expect(formatMsg(lang, m)).not.toMatch(/[{}@]/);
      expect(verdictMsgs(r)).toEqual(v);
    }
  });

  it("Draft Lab swaps one decision, never mutates the original, and is practice-only", () => {
    const s = playOut(createDraft(cfg("lab-seed", "classic")));
    const r = runSeason(s);
    const before = JSON.stringify(s);
    const lab = labReplace(s, 4, (s.picks[4]!.optionIndex + 1) % 3);
    expect(lab.practice).toBe(true);
    expect(lab.state.picks[4]!.playerEraId).not.toBe(s.picks[4]!.playerEraId);
    expect(lab.state.picks.filter((p, i) => i !== 4).map((p) => p.playerEraId)).toEqual(s.picks.filter((_, i) => i !== 4).map((p) => p.playerEraId));
    expect(JSON.stringify(s)).toBe(before);
    expect(draftRatings(lab.state)).toBeTruthy();
    const tips = worthReconsidering(s, r);
    expect(tips.length).toBeLessThanOrEqual(3);
    for (const x of tips) expect(x.pts).toBeGreaterThan(0);
    for (let i = 1; i < tips.length; i++) expect(tips[i - 1]!.pts).toBeGreaterThanOrEqual(tips[i]!.pts);
  });
});

describe("settings", () => {
  it("sanitises anything and pins draft aids in competitive contexts only", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ simSpeed: "warp", motion: 3, hints: "yes" })).toEqual(DEFAULT_SETTINGS);
    const mine = { ...DEFAULT_SETTINGS, hints: false, preview: false, simSpeed: "instant" as const };
    expect(effectiveSettings(mine, { competitive: false })).toEqual(mine);
    const pinned = effectiveSettings(mine, { competitive: true });
    expect(pinned.hints && pinned.preview).toBe(true);
    expect(pinned.simSpeed).toBe("instant"); // presentation never changes a result
    expect(DEFAULT_SETTINGS.sound).toBe(false);
    expect(Object.values(DEFAULT_SETTINGS.notifications).every((v) => v === false)).toBe(true);
  });
});

describe("free-to-play guardrails", () => {
  it("ERA+ sells depth around the loop, never strength inside it", () => {
    for (const f of FORBIDDEN) expect(ERA_PLUS as readonly string[]).not.toContain(f);
    expect(has(FREE, "draft_lab")).toBe(false);
  });

  it("a received challenge is always playable, premium rules or not", () => {
    expect(canPlayReceivedChallenge(FREE, { premiumRules: true })).toBe(true);
    expect(canPlayReceivedChallenge(FREE, { premiumRules: false })).toBe(true);
  });

  it("sponsor slots exist only outside the draft loop, and none are configured", () => {
    const slots: SponsorSlot[] = ["home", "daily", "result"];
    for (const s of slots) expect(sponsorFor(s)).toBeNull();
    expect(SPONSORS).toEqual([]);
  });

  it("no install suggestion before engagement or after a dismissal; no permission asks", async () => {
    expect(shouldSuggestInstall({ dismissed: false, installed: false }, INSTALL_AFTER_GAMES - 1)).toBe(false);
    expect(shouldSuggestInstall({ dismissed: true, installed: false }, 99)).toBe(false);
    expect(PUSH_AVAILABLE).toBe(false);
    expect(await requestInContext("daily")).toBe("unavailable");
  });
});

describe("PWA + catalogue + i18n", () => {
  it("manifest is installable and standalone", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toContain("/");
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("mode groups cover every live mode once (Daily and Weekly are entry points)", () => {
    const ids = MODE_GROUPS.flatMap((g) => g.entries.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of Object.keys(RULESETS)) {
      if (id === "daily" || id === "weekly" || RULESETS[id as ModeId].status !== "live") continue;
      expect(ids, id).toContain(id);
    }
  });

  it("has every new dynamic key in every language", () => {
    const need = [
      ...WEEKLY_EVENTS.flatMap((e) => [`weekly.${e.id}.name`, `weekly.${e.id}.desc`]),
      ...oneLeagueIds().map((c) => `league.${c}`),
      ...ACHIEVEMENTS.flatMap((a) => [`ach.${a.id}.name`, `ach.${a.id}.desc`]),
      ...MODE_GROUPS.map((g) => `modes.group.${g.id}`),
      ...["live", "fast", "instant"].map((v) => `settings.sim.${v}`),
      ...["system", "full", "reduced"].map((v) => `settings.motion.${v}`),
      ...["daily", "challenge", "duel", "weekly"].map((v) => `settings.notif.${v}`),
      "why.elite", "why.strong", "why.mainWeakness", "why.limited",
    ];
    for (const lang of LANGS) for (const k of need) expect((CATALOGS[lang] as Record<string, string>)[k], `${lang} ${k}`).toBeTruthy();
    for (const k of need) expect(k in en).toBe(true);
  });
});
