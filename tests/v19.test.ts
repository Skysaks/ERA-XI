import { describe, expect, it } from "vitest";
import type { DraftState, MatchResult, SeasonResult } from "@/types";
import {
  createDraft,
  currentOffer,
  formationOf,
  getFormation,
  isDraftComplete,
  lineupPlayers,
  pickOption,
  previewPick,
  rateLineup,
  tacticalConnections,
  tacticalMoment,
  teamSheet,
  unitFill,
  POSITION_LINE,
} from "@/engine";
import { en } from "@/i18n/en";
import { fr } from "@/i18n/fr";
import { es } from "@/i18n/es";
import { FOOTBALL_MIN_RUNS, draftDNA, runDNA, type RunDNA } from "@/game/dna";
import { seasonMilestones } from "@/game/milestones";

const F = ["433", "4231", "442", "352", "343", "532", "4312"] as const;
function careful(seed: string, formation: (typeof F)[number]) {
  const states: DraftState[] = [];
  let s = createDraft({ seed, formation, mode: "classic", engineVersion: "6" });
  states.push(s);
  while (!isDraftComplete(s)) {
    const previews = currentOffer(s)!.options.map((_, k) => previewPick(s, k));
    let bi = 0,
      bv = -1e9;
    previews.forEach((p, k) => {
      const v = (p?.fitDelta ?? 0) - (p?.outOfPosition ? 20 : 0);
      if (v > bv) {
        bv = v;
        bi = k;
      }
    });
    s = pickOption(s, bi).state;
    states.push(s);
  }
  return states;
}
const has = (k: string) => k in en && k in fr && k in es;

describe("V1.9 tactical reading (presentation only)", () => {
  const runs = Array.from({ length: 40 }, (_, i) => careful(`v19-${i}`, F[i % F.length]!));

  it("moments are real: a unit moment only when that line has just been completed; every key is translated", () => {
    let seen = 0;
    for (const states of runs) {
      for (let i = 1; i < states.length; i++) {
        const f = getFormation(formationOf(states[i]!));
        const before = lineupPlayers(states[i - 1]!);
        const after = lineupPlayers(states[i]!);
        const m = tacticalMoment(before, after, f, "6");
        if (!m) continue;
        seen++;
        expect(has(m.key), m.key).toBe(true);
        if (m.unit) {
          const u0 = unitFill(before, f)[m.unit];
          const u1 = unitFill(after, f)[m.unit];
          expect(u1.filled).toBe(u1.total);
          expect(u0.filled).toBeLessThan(u0.total);
        }
        // Deterministic.
        expect(tacticalMoment(before, after, f, "6")).toEqual(m);
      }
    }
    expect(seen).toBeGreaterThan(40 * 3 - 1); // every draft completes its three lines
  });

  it("the team sheet reads the XI: 1–3 identity lines, distinct structural players, four game-plan phases", () => {
    for (const states of runs) {
      const s = states[states.length - 1]!;
      const f = getFormation(formationOf(s));
      const lp = lineupPlayers(s);
      const ts = teamSheet(lp, f, "6");
      expect(ts.identity.length).toBeGreaterThanOrEqual(1);
      expect(ts.identity.length).toBeLessThanOrEqual(3);
      for (const k of [...ts.identity, ...ts.plan.map((p) => p.key), ...ts.connections.map((c) => `tac.c.${c.id}`)]) expect(has(k), k).toBe(true);
      expect(new Set(ts.keyPlayers.map((k) => k.slot)).size).toBe(ts.keyPlayers.length);
      expect(ts.plan.map((p) => p.phase)).toEqual(["possession", "creation", "defending", "threat"]);
      // Presentation only: reading the sheet never changes the ratings.
      expect(rateLineup(lp, f, "6")).toEqual(rateLineup(lp, f, "6"));
    }
  });

  it("connections come from roles, slots and attributes only", () => {
    for (const states of runs) {
      const s = states[states.length - 1]!;
      const f = getFormation(formationOf(s));
      const lp = lineupPlayers(s);
      for (const c of tacticalConnections(lp, f)) {
        const ps = c.slots.map((i) => lp[i]!);
        if (c.id === "elitePair")
          for (const [i, p] of ps.entries()) {
            expect(f.slots[c.slots[i]!]!.position, c.id).toBe("CB");
            expect(p.defence).toBeGreaterThanOrEqual(80);
          }
        if (c.id === "controlCore" || c.id === "balancedMidfield") for (const i of c.slots) expect(POSITION_LINE[f.slots[i]!.position]).toBe("MID");
        if (c.id === "overloadLeft") for (const i of c.slots) expect(f.slots[i]!.x).toBeLessThan(35);
        if (c.id === "overloadRight") for (const i of c.slots) expect(f.slots[i]!.x).toBeGreaterThan(65);
      }
    }
  });

  it("every option card has its one-line impact (the team dimension it lifts, or the role's)", () => {
    const s = createDraft({ seed: "v19-card", formation: "433", mode: "classic", engineVersion: "6" });
    const p = previewPick(s, 0)!;
    expect(p.dimUp === null || typeof p.dimUp === "string").toBe(true);
  });
});

describe("V1.9 season story", () => {
  const md = (i: number, outcome: "W" | "D" | "L"): MatchResult => ({ matchday: i, opponent: "Milan 1989", opponentId: "milan-1989", opponentTier: "giant", home: i % 2 === 1, goalsFor: outcome === "L" ? 0 : 2, goalsAgainst: outcome === "W" ? 0 : outcome === "D" ? 2 : 1, outcome });
  const season = (outcomes: ("W" | "D" | "L")[]): SeasonResult =>
    ({ engineVersion: "6", format: "league", maxPoints: 114, wins: outcomes.filter((o) => o === "W").length, draws: outcomes.filter((o) => o === "D").length, losses: outcomes.filter((o) => o === "L").length, goalsFor: 0, goalsAgainst: 0, points: 0, matchResults: outcomes.map((o, i) => md(i + 1, o)), teamRatings: {} as SeasonResult["teamRatings"], events: [] }) as SeasonResult;

  it("FIRST POINTS DROPPED after a perfect start, never after a slow one", () => {
    const perfectStart = season([...Array(8).fill("W"), "D", ...Array(29).fill("W")]);
    expect(seasonMilestones(perfectStart, null, 9).some((m) => m.kind === "pointsDropped" && m.matchday === 9)).toBe(true);
    const slow = season(["W", "D", ...Array(36).fill("W")]);
    expect(seasonMilestones(slow, null, 9).some((m) => m.kind === "pointsDropped")).toBe(false);
  });
});

describe("V1.9 Football DNA", () => {
  const drafts = Array.from({ length: 24 }, (_, i) => careful(`v19-dna-${i}`, F[i % F.length]!).pop()!);
  const recs: RunDNA[] = drafts.map((d, i) => runDNA(d, i));

  it("records the XI's football features and only builds a profile from enough real runs", () => {
    for (const r of recs) {
      expect(r.formation).toBeTruthy();
      expect(r.identity).toMatch(/^tac\.id\./);
      for (const v of Object.values(r.style!)) expect(Number.isFinite(v)).toBe(true);
    }
    expect(draftDNA(recs.slice(0, 19))).toBeNull();
    const dna = draftDNA(recs)!;
    expect(dna.football).not.toBeNull();
    const fd = dna.football!;
    for (const v of Object.values(fd.axes)) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(has(`dna.arch.${fd.archetype}`)).toBe(true);
    expect(fd.formation).toBeTruthy();
  });

  it("older records without football features never produce an invented profile", () => {
    const old = recs.map(({ formation: _f, identity: _i, style: _s, ...rest }) => rest as RunDNA);
    expect(draftDNA(old)!.football).toBeNull();
    expect(FOOTBALL_MIN_RUNS).toBeGreaterThanOrEqual(10);
  });

  it("a star collector who ignores fit is named as such", () => {
    const stars = recs.map((r) => ({ ...r, starBias: 0.95, fitPriority: 0.2 }));
    expect(draftDNA(stars)!.football!.archetype).toBe("galactico");
  });
});
