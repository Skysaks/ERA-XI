import { afterEach, describe, expect, it } from "vitest";
import type { DraftConfig, DraftState, FormationId, ModeId, TeamRatings } from "@/types";
import {
  ALL_FORMATION_IDS,
  ENGINE_VERSION,
  RULESETS,
  RULESET_IDS,
  createDraft,
  currentOffer,
  currentProjection,
  draftRatings,
  expectedSeason,
  formationIdsFor,
  formationOptions,
  formationProjection,
  getFormation,
  isDraftComplete,
  lineOf,
  lineupPlayers,
  optimiseFrom,
  optimiseXI,
  pickOption,
  positionRatings,
  runSeason,
  simulateSeason,
  solvability,
  autoPlace,
  rateLineup,
  formationOf,
  currentEvent,
} from "@/engine";
import { getPlayerEra } from "@/data";
import { reducer, type GameState } from "@/game/machine";
import { DEFAULT_PROFILE, loadProfile } from "@/game/storage";
import { en } from "@/i18n/en";
import { fr } from "@/i18n/fr";
import { es } from "@/i18n/es";

const V = ENGINE_VERSION;
const cfg = (seed: string, mode: ModeId = "classic", formation: FormationId = "433", extra: Partial<DraftConfig> = {}): DraftConfig => ({ seed, formation, mode, engineVersion: V, ...extra });
const dup = (s: DraftState, i: number) => lineupPlayers(s).some((x) => x?.playerId === getPlayerEra(currentOffer(s)!.options[i]!).playerId);
const legal = (s: DraftState) => currentOffer(s)!.options.map((_, i) => i).filter((i) => !dup(s, i));

/** Sensible drafter: overall × players + FIT, keeper-aware (same as scripts/calibration.ts). */
function competent(s: DraftState): number {
  const f = getFormation(formationOf(s));
  const before = lineupPlayers(s);
  const hasGk = before.some((p) => p?.positions[0] === "GK");
  let best = legal(s)[0] ?? 0, bestV = -Infinity;
  for (const i of legal(s)) {
    const p = getPlayerEra(currentOffer(s)!.options[i]!);
    const after = autoPlace(before, p, f);
    const r = rateLineup(after, f, V);
    const n = after.filter(Boolean).length;
    let v = r.overall * n + r.fit * 0.6 * (n / 11) * 5;
    if (!hasGk && p.positions[0] === "GK" && 11 - s.round <= 5) v += 400;
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}
const playOut = (s: DraftState, pick: (s: DraftState) => number) => {
  let st = s;
  while (!isDraftComplete(st)) st = pickOption(st, pick(st)).state;
  return st;
};
let rngState = 7;
const rand = () => ((rngState = (rngState * 1103515245 + 12345) % 2147483648) / 2147483648);

describe("draft fairness (Director)", () => {
  it("whatever was picked before, whenever a complete in-position route exists, the offer keeps one", () => {
    const forms: FormationId[] = ["433", "4231", "352", "532", "4312", "424"];
    let checked = 0;
    for (let k = 0; k < 150; k++) {
      let s = createDraft(cfg(`vsixteen-route${k}`, "classic", forms[k % forms.length]!));
      while (!isDraftComplete(s)) {
        if (s.round >= 4 && solvability(s).feasible) {
          checked++;
          const keeps = legal(s).some((i) => {
            const n = pickOption(s, i).state;
            return isDraftComplete(n) || solvability(n).feasible;
          });
          expect(keeps, `seed ${k} round ${s.round + 1}`).toBe(true);
        }
        // Random drafter: routes are sometimes broken on purpose — the guarantee is per offer.
        const opts = legal(s);
        s = pickOption(s, opts[Math.floor(rand() * opts.length)]!).state;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it("rounds 1–4 offer variety: options span at least two lines of the pitch", () => {
    let offers = 0, varied = 0;
    for (let k = 0; k < 60; k++) {
      let s = createDraft(cfg(`vsixteen-var${k}`));
      for (let r = 0; r < 4; r++) {
        const lines = new Set(currentOffer(s)!.options.map((id) => lineOf(getPlayerEra(id).positions[0]!)));
        offers++;
        if (lines.size >= 2) varied++;
        s = pickOption(s, legal(s)[0]!).state;
      }
    }
    expect(varied / offers).toBeGreaterThan(0.95);
  });

  it("the highest rating is often not the best pick: taking the best player every round loses clearly", () => {
    const greedy = (s: DraftState) => legal(s)[0]!; // options are stored strongest-first
    let g = 0, c = 0;
    const N = 40;
    for (let k = 0; k < N; k++) {
      const seed = `vsixteen-greedy${k}`;
      g += expectedSeason(draftRatings(playOut(createDraft(cfg(seed)), greedy)), seed, V).expected;
      c += expectedSeason(draftRatings(playOut(createDraft(cfg(seed)), competent)), seed, V).expected;
    }
    expect(c / N - g / N).toBeGreaterThan(15);
  });
});

describe("formations: projections are computed incrementally and agree with the batch API", () => {
  it("formationProjection / optimiseFrom = formationOptions / optimiseXI", () => {
    for (const seed of ["vsixteen-f1", "vsixteen-f2", "vsixteen-f3"]) {
      const s = playOut(createDraft(cfg(seed)), competent);
      const ids = formationIdsFor(s);
      expect(ids).toEqual(ALL_FORMATION_IDS);
      const inc = ids.map((id) => formationProjection(s, id));
      expect(inc).toEqual(formationOptions(s));
      expect(optimiseFrom(currentProjection(s), inc)).toEqual(optimiseXI(s));
    }
  });

  it("locked rulesets expose only their own formation", () => {
    const s = playOut(createDraft(cfg("vsixteen-lock", "position", "442")), () => 0);
    expect(formationIdsFor(s)).toEqual(["442"]);
  });
});

describe("manual positioning", () => {
  it("tap a player, then a slot: they swap, nothing else moves", () => {
    const draft = playOut(createDraft(cfg("vsixteen-swap")), competent);
    let st: GameState = { phase: "XI_COMPLETE", draft, selectedSlot: null } as unknown as GameState;
    st = reducer(st, { type: "TAP_SLOT", index: 2 });
    st = reducer(st, { type: "TAP_SLOT", index: 7 });
    const after = (st as { draft: DraftState }).draft.lineup;
    expect(after[2]).toBe(draft.lineup[7]);
    expect(after[7]).toBe(draft.lineup[2]);
    expect(after.filter((_, i) => i !== 2 && i !== 7)).toEqual(draft.lineup.filter((_, i) => i !== 2 && i !== 7));
  });
});

describe("position ratings", () => {
  it("contextual ratings are ordered and honest (natural = overall)", () => {
    const s = playOut(createDraft(cfg("vsixteen-pos")), competent);
    for (const p of lineupPlayers(s)) {
      if (!p) continue;
      const rows = positionRatings(p, 4);
      expect(rows[0]!.position).toBe(p.positions[0]);
      expect(rows[0]!.rating).toBe(p.overall);
      for (let i = 1; i < rows.length; i++) expect(rows[i]!.rating).toBeLessThanOrEqual(rows[i - 1]!.rating);
    }
  });
});

describe("calibration invariants (v4)", () => {
  it("competent drafting lands in the 'good' band on average; the spread reaches 100+", () => {
    const pts: number[] = [];
    for (let k = 0; k < 60; k++) {
      const s = playOut(createDraft(cfg(`vsixteen-cal${k}`, "classic", (["433", "4231", "442", "352", "343"] as FormationId[])[k % 5]!)), competent);
      pts.push(runSeason(s).points);
    }
    const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
    expect(mean).toBeGreaterThan(84);
    expect(mean).toBeLessThan(97);
    expect(Math.max(...pts)).toBeGreaterThanOrEqual(98);
  });

  it("114 is attainable with normal luck for an elite XI (sampled, not only in theory)", () => {
    const elite: TeamRatings = {
      att: 94, mid: 93, def: 92, gk: 93, overall: 93, fit: 98, outOfPosition: 0, overlap: 0,
      dims: { width: 90, finishing: 95, creation: 95, progression: 90, retention: 92, coverage: 92, ballWinning: 90, pace: 90, aerial: 86, buildUp: 90 },
    };
    let perfect = 0;
    const N = 1500;
    for (let k = 0; k < N; k++) if (simulateSeason({ ratings: elite, seed: `vsixteen-114-${k}`, engineVersion: V }).points === 114) perfect++;
    // Exact expectation says ~5.6% for this XI; sampled must be visibly non-zero and not common.
    expect(perfect).toBeGreaterThan(20);
    expect(perfect / N).toBeLessThan(0.15);
  });

  it("113 can never happen (37W 1D = 112, 38W = 114)", () => {
    const d = expectedSeason({ att: 94, mid: 93, def: 92, gk: 93, overall: 93, fit: 98, outOfPosition: 0, overlap: 0, dims: { width: 90, finishing: 95, creation: 95, progression: 90, retention: 92, coverage: 92, ballWinning: 90, pace: 90, aerial: 86, buildUp: 90 } }, "vsixteen-113", V);
    expect(d.pmf[113] ?? 0).toBe(0);
  });
});

describe("every solo mode can be entered and completed", () => {
  it("all non-room rulesets draft, simulate and score within 0–114", () => {
    const rooms = new Set(["liveduel", "party", "shared", "rival"]);
    for (const id of RULESET_IDS) {
      if (rooms.has(id)) continue;
      // Pre-draft choices (period / club / league) are omitted: the seed draws them.
      const s = playOut(createDraft(cfg(`vsixteen-mode-${id}`, id as ModeId, RULESETS[id].formationPolicy === "locked" ? "442" : "433", id === "weekly" ? { event: currentEvent().event.id } : {})), (st) => legal(st)[0] ?? 0);
      const r = runSeason(s);
      expect(r.points, id).toBeGreaterThanOrEqual(0);
      expect(r.points, id).toBeLessThanOrEqual(r.maxPoints);
    }
  });
});

describe("persistence safety", () => {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => {
    store.clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("corrupted JSON falls back to defaults and keeps the unreadable copy aside", () => {
    (globalThis as { localStorage?: unknown }).localStorage = fake;
    store.set("eraxi:v1", "{not json");
    const p = loadProfile();
    expect(p.games).toBe(DEFAULT_PROFILE.games);
    expect(store.get("eraxi:v1:unreadable")).toBe("{not json");
  });

  it("hostile values are sanitised field by field", () => {
    (globalThis as { localStorage?: unknown }).localStorage = fake;
    store.set("eraxi:v1", JSON.stringify({ v: 1, games: "lots", prefs: { mode: "hack", formation: "999", recentFormations: ["433", "xx", "433"] }, name: "a".repeat(80) }));
    const p = loadProfile();
    expect(p.games).toBe(0);
    expect(p.prefs.mode).toBe("classic");
    expect(p.prefs.formation).toBe("433");
    expect(p.prefs.recentFormations).toEqual(["433"]);
    expect(p.name.length).toBeLessThanOrEqual(16);
  });
});

describe("i18n for V1.6", () => {
  it("first-run guidance, formation action and error screen exist in all three languages", () => {
    for (const k of ["guide.r1", "guide.r2", "guide.r3", "xi.formationCta", "formation.best", "formation.oop", "optimise.oop", "stat.ovr", "error.title", "error.body", "error.home"] as const) {
      for (const cat of [en, fr, es] as Record<string, string>[]) expect(cat[k], k).toBeTruthy();
    }
  });
});
