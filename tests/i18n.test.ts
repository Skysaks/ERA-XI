import { beforeAll, describe, expect, it } from "vitest";
import { CATALOGS, LANGS, detectLang, en, formatMsg, loadAllCatalogs, translate } from "@/i18n";
import { DIMENSIONS, ERA_BUCKETS, RULESET_IDS, analyseRun, compareRuns, createDraft, currentOffer, isDraftComplete, observationMsgs, pickOption, runSeason, ENGINE_VERSION } from "@/engine";
import { ARCHETYPES } from "@/data/archetypes";
import type { DraftState } from "@/types";

beforeAll(() => loadAllCatalogs());

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("i18n catalogs", () => {
  it("every language has every key, non-empty, with the same placeholders", () => {
    for (const lang of LANGS) {
      const cat = CATALOGS[lang] as Record<string, string>;
      for (const [k, v] of Object.entries(en)) {
        expect(cat[k], `${lang} ${k}`).toBeTruthy();
        expect(placeholders(cat[k]!), `${lang} ${k}`).toBe(placeholders(v));
      }
    }
  });

  it("has a key for every dynamic id the UI renders", () => {
    const need = [
      ...RULESET_IDS.flatMap((id) => [`mode.${id}.name`, `mode.${id}.desc`]),
      ...["GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST"].flatMap((p) => [`pos.${p}`, `posName.${p}`]),
      ...Object.keys(ARCHETYPES).map((r) => `role.${r}`),
      ...DIMENSIONS.flatMap((d) => [`dim.${d}`, `dimShort.${d}`, `obs.strength.${d}`, `obs.weakness.${d}`, `axis.${d}`]),
      ...ERA_BUCKETS.map((b) => `bucket.${b}`),
      ...["first_defeat", "statement_win", "five_goals", "winning_streak", "unbeaten_run", "invincible"].map((e) => `event.${e}`),
      ...["malformed", "outdated", "invalid", "score_mismatch"].map((n) => `notice.${n}`),
      ...["liveduel", "party", "shared"].flatMap((r) => [`room.tag.${r}`, `live.create.${r}`]),
    ];
    for (const k of need) expect(k in en, k).toBe(true);
  });

  it("plurals follow each language's rule; nested references are translated", () => {
    expect(translate("en", "home.games", { n: 1 })).toBe("1 game");
    expect(translate("en", "home.games", { n: 0 })).toBe("0 games");
    expect(translate("fr", "home.games", { n: 0 })).toBe("0 partie");
    expect(translate("es", "home.games", { n: 2 })).toBe("2 partidas");
    expect(formatMsg("fr", { key: "ax.builtOn", params: { a: "@dim.pace|lc" } })).toBe("Force principale : vitesse.");
  });

  it("detects the browser language", () => {
    expect(detectLang({ languages: ["fr-FR", "en"] })).toBe("fr");
    expect(detectLang({ language: "es-MX" })).toBe("es");
    expect(detectLang({ language: "de-DE" })).toBe("en");
    expect(detectLang(undefined)).toBe("en");
  });

  it("engine messages render in all three languages without leaking keys", () => {
    let s: DraftState = createDraft({ seed: "i18nseed1", formation: "433", mode: "classic", engineVersion: ENGINE_VERSION });
    while (!isDraftComplete(s)) s = pickOption(s, currentOffer(s)!.options.length - 1).state;
    let b: DraftState = createDraft({ seed: "i18nseed1", formation: "433", mode: "classic", engineVersion: ENGINE_VERSION });
    while (!isDraftComplete(b)) b = pickOption(b, 0).state;
    const r = runSeason(s);
    const cmp = compareRuns({ state: s, ratings: r.teamRatings, points: r.points }, { state: b, ratings: runSeason(b).teamRatings, points: runSeason(b).points }, "Ana", 4);
    const msgs = [...analyseRun(s, r).explanationMsgs, ...observationMsgs(r.teamRatings).map((o) => o.msg), ...cmp.summaryMsgs, ...cmp.differences.map((d) => d.summaryMsg)];
    expect(msgs.length).toBeGreaterThan(3);
    for (const lang of LANGS) {
      for (const m of msgs) {
        const out = formatMsg(lang, m);
        expect(out, `${lang} ${m.key}`).not.toMatch(/\{\w+\}|@\w|^(ax|obs|cmp)\./);
      }
    }
  });
});
