/**
 * Parameter search for the v4 season model — exact expectations on a fixed population of
 * v4-drafted XIs (no sampling noise), plus a synthetic "perfect" XI. Prints the tail
 * probabilities per candidate so the final choice is made from measurements.
 */
import {
  autoPlace, buildLeague, createDraft, currentOffer, draftRatings, formationOf, freshSeed, getFormation,
  integrateForm, isDraftComplete, lineupPlayers, pickOption, poissonOutcome, rateLineup, seasonDistribution, teamIndices,
} from "@/engine";
import { getPlayerEra } from "@/data";
import type { DraftState, FormationId, TeamRatings } from "@/types";

const N = Number(process.argv[3] ?? 500);
const V = "4";

function policy(kind: "competent" | "expert") {
  return (s: DraftState) => {
    const offer = currentOffer(s)!;
    const f = getFormation(formationOf(s));
    const before = lineupPlayers(s);
    const hasGk = before.some((p) => p?.positions[0] === "GK");
    let best = 0, bestV = -Infinity;
    offer.options.forEach((id, i) => {
      const p = getPlayerEra(id);
      if (before.some((x) => x?.playerId === p.playerId)) return;
      const after = autoPlace(before, p, f);
      const r = rateLineup(after, f, V);
      const filled = after.filter(Boolean).length;
      let v: number;
      if (kind === "competent") v = r.overall * filled + r.fit * 0.6 * (filled / 11) * 5;
      else { const t = teamIndices(r); v = (t.attack + t.defence) * filled + r.fit * 0.4 * filled; }
      if (!hasGk && p.positions[0] === "GK" && 11 - s.round <= 5) v += 1000;
      if (v > bestV) { bestV = v; best = i; }
    });
    return best;
  };
}

const F: FormationId[] = ["433", "4231", "442", "352", "343"];
const pop: { kind: string; r: TeamRatings; seed: string }[] = [];
for (const kind of ["competent", "expert"] as const) {
  const pol = policy(kind);
  for (let i = 0; i < N; i++) {
    const seed = freshSeed();
    let s = createDraft({ seed, formation: F[i % 5]!, mode: "classic", engineVersion: V });
    while (!isDraftComplete(s)) s = pickOption(s, pol(s)).state;
    pop.push({ kind, r: draftRatings(s), seed });
  }
}
const perfect: TeamRatings = {
  att: 94, mid: 93, def: 92, gk: 93, overall: 93, fit: 98,
  dims: { width: 90, finishing: 95, creation: 95, progression: 90, retention: 92, coverage: 92, ballWinning: 90, pace: 90, aerial: 86, buildUp: 90 },
  outOfPosition: 0, overlap: 0,
};
const great: TeamRatings = { ...perfect, att: 91, mid: 90, def: 89, gk: 90, overall: 90, fit: 94 };

export interface P { offset: number; K: number; amp: number; dom: number; eliteAmp: number; base: number; domE?: number }

function dist(r: TeamRatings, seed: string, p: P) {
  const league = buildLeague(seed, V).map((o) => ({ ...o, attack: o.attack + 2 - p.offset, defence: o.defence + 2 - p.offset }));
  const { attack, defence } = teamIndices(r);
  const e = Math.max(0, Math.min(1, ((attack + defence) / 2 - 88) / 8));
  const amp = p.amp * (1 - p.eliteAmp * e);
  const ms = [];
  for (let h = 0; h < 2; h++) for (const o of league) {
    const home = h === 0;
    ms.push(integrateForm(amp, (form) => {
      const edge = Math.max(0, attack + form - o.defence);
      return poissonOutcome(
        Math.max(0.08, Math.min(4.6, p.base * Math.exp(p.K * (attack + form - o.defence)) * (home ? 1.1 : 0.92))),
        Math.max(0.05, Math.min(4.6, p.base * Math.exp(p.K * (o.attack - defence - form) - (p.dom + (p.domE ?? 0) * e) * edge) * (home ? 0.92 : 1.1))),
      );
    }));
  }
  return seasonDistribution(ms);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number) => (x >= 0.01 ? `${(x * 100).toFixed(1)}%` : x >= 0.0001 ? `${(x * 100).toFixed(2)}%` : `${(x * 100).toExponential(0)}%`);
function evalP(p: P) {
  const out: string[] = [];
  for (const kind of ["competent", "expert"]) {
    const ds = pop.filter((t) => t.kind === kind).map((t) => dist(t.r, t.seed, p));
    out.push(`${kind[0]}: ${mean(ds.map((d) => d.expected)).toFixed(1)} ≥100 ${pct(mean(ds.map((d) => d.atLeast(100))))} ≥105 ${pct(mean(ds.map((d) => d.atLeast(105))))} ≥110 ${pct(mean(ds.map((d) => d.atLeast(110))))} ≥113 ${pct(mean(ds.map((d) => d.atLeast(113))))} 114 ${pct(mean(ds.map((d) => d.atLeast(114))))}`);
  }
  const seeds = pop.slice(0, 40).map((t) => t.seed);
  const pf = seeds.map((s) => dist(perfect, s, p));
  const gr = seeds.map((s) => dist(great, s, p));
  out.push(`perfect: ${mean(pf.map((d) => d.expected)).toFixed(1)} 114 ${pct(mean(pf.map((d) => d.atLeast(114))))} ≥110 ${pct(mean(pf.map((d) => d.atLeast(110))))}`);
  out.push(`great: ${mean(gr.map((d) => d.expected)).toFixed(1)} 114 ${pct(mean(gr.map((d) => d.atLeast(114))))}`);
  return out.join(" | ");
}

const base: P = { offset: 2, K: 0.072, amp: 1.5, dom: 0, eliteAmp: 0, base: 1.1 };
console.log(`population: ${pop.length} XIs · competent overall ${mean(pop.filter((t) => t.kind === "competent").map((t) => t.r.overall)).toFixed(1)} FIT ${mean(pop.filter((t) => t.kind === "competent").map((t) => t.r.fit)).toFixed(1)}`);
console.log("v3 model      ", evalP(base));
const grid: P[] = [];
for (const offset of [2.5, 3]) for (const K of [0.072, 0.076]) for (const domE of [0, 0.03, 0.06, 0.1]) grid.push({ ...base, offset, K, dom: 0, domE, eliteAmp: 0.6 });
for (const p of grid) console.log(`o${p.offset} K${p.K} dE${p.domE}`.padEnd(16), evalP(p));
