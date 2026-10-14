/**
 * Where does the difficulty come from? Holds a population of competently drafted XIs
 * fixed and changes one factor of the v3 model at a time (exact expectation, no noise):
 * FIT penalty, opponent strength, form variance, strength mapping, draw rate — and the
 * draw ceiling (best XI a hindsight beam search could build from the same offers).
 */
import {
  autoPlace, buildLeague, createDraft, currentOffer, draftRatings, formationOf, freshSeed, getFormation,
  integrateForm, isDraftComplete, lineupPlayers, pickOption, poissonOutcome, rateLineup, seasonDistribution, teamIndices,
} from "@/engine";
import { getPlayerEra } from "@/data";
import type { DraftState, FormationId, TeamRatings } from "@/types";

const N = Number(process.argv[3] ?? 600);
const V = "3";

const competent = (s: DraftState) => {
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
    let v = r.overall * filled + r.fit * 0.6 * (filled / 11) * 5;
    if (!hasGk && p.positions[0] === "GK" && 11 - s.round <= 5) v += 400;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};

/** Hindsight beam search over the fixed offers: the best XI this draw allowed. */
function beamBest(seed: string, formation: FormationId, width = 40): TeamRatings {
  let beam: DraftState[] = [createDraft({ seed, formation, mode: "classic", engineVersion: V })];
  for (let round = 0; round < 11; round++) {
    const next: { s: DraftState; v: number }[] = [];
    for (const s of beam) {
      const offer = currentOffer(s)!;
      offer.options.forEach((id, i) => {
        if (lineupPlayers(s).some((x) => x?.playerId === getPlayerEra(id).playerId)) return;
        const n = pickOption(s, i).state;
        const r = draftRatings(n);
        const t = teamIndices(r);
        next.push({ s: n, v: t.attack + t.defence + (n.lineup.filter(Boolean).length) * 3 });
      });
    }
    next.sort((a, b) => b.v - a.v);
    beam = next.slice(0, width).map((x) => x.s);
  }
  return draftRatings(beam[0]!);
}

interface Params { offset: number; amp: number; K: number; base: number; fitCoef: number; homeF: number; homeA: number }
const V3: Params = { offset: 2, amp: 1.5, K: 0.072, base: 1.1, fitCoef: 0.1, homeF: 1.1, homeA: 0.92 };

function expected(r: TeamRatings, seed: string, p: Params) {
  const league = buildLeague(seed, V).map((o) => ({ ...o, attack: o.attack + V3.offset - p.offset, defence: o.defence + V3.offset - p.offset }));
  const fitPenalty = (100 - r.fit) * p.fitCoef;
  const base = teamIndices({ ...r, fit: 100 });
  const attack = base.attack - fitPenalty;
  const defence = base.defence - fitPenalty;
  const matches = [];
  for (let h = 0; h < 2; h++) {
    for (const opp of league) {
      const home = h === 0;
      matches.push(integrateForm(p.amp, (form) => poissonOutcome(
        Math.max(0.08, Math.min(4.2, p.base * Math.exp(p.K * (attack + form - opp.defence)) * (home ? p.homeF : p.homeA))),
        Math.max(0.08, Math.min(4.2, p.base * Math.exp(p.K * (opp.attack - defence - form)) * (home ? p.homeA : p.homeF))),
      )));
    }
  }
  return seasonDistribution(matches);
}

const teams: { r: TeamRatings; seed: string }[] = [];
const ceilings: TeamRatings[] = [];
const FORMS: FormationId[] = ["433", "4231", "442", "352", "343"];
for (let i = 0; i < N; i++) {
  const seed = freshSeed();
  const formation = FORMS[i % 5]!;
  let s = createDraft({ seed, formation, mode: "classic", engineVersion: V });
  while (!isDraftComplete(s)) s = pickOption(s, competent(s)).state;
  teams.push({ r: draftRatings(s), seed });
  if (i < 150) ceilings.push(beamBest(seed, formation));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number) => `${(x * 100).toFixed(x < 0.001 ? 4 : 2)}%`;
const report = (label: string, p: Params, map: (r: TeamRatings) => TeamRatings = (r) => r) => {
  const ds = teams.map((t) => expected(map(t.r), t.seed, p));
  console.log(`| ${label} | ${mean(ds.map((d) => d.expected)).toFixed(1)} | ${pct(mean(ds.map((d) => d.atLeast(100))))} | ${pct(mean(ds.map((d) => d.atLeast(105))))} | ${pct(mean(ds.map((d) => d.atLeast(110))))} | ${pct(mean(ds.map((d) => d.atLeast(114))))} |`);
};

console.log(`competent XIs: ${N} · mean overall ${mean(teams.map((t) => t.r.overall)).toFixed(1)} · FIT ${mean(teams.map((t) => t.r.fit)).toFixed(1)} · OOP ${mean(teams.map((t) => t.r.outOfPosition)).toFixed(2)}`);
console.log(`hindsight ceiling (beam, ${ceilings.length} draws): overall ${mean(ceilings.map((r) => r.overall)).toFixed(1)} (max ${Math.max(...ceilings.map((r) => r.overall))}) · FIT ${mean(ceilings.map((r) => r.fit)).toFixed(1)} · OOP ${mean(ceilings.map((r) => r.outOfPosition)).toFixed(2)}`);
console.log(`\n| variant | exp. pts | ≥100 | ≥105 | ≥110 | 114 |\n|---|---|---|---|---|---|`);
report("v3 as shipped", V3);
report("FIT penalty removed (FIT=100)", V3, (r) => ({ ...r, fit: 100 }));
report("FIT cost halved", { ...V3, fitCoef: 0.05 });
report("opponents −3 (weaker league)", { ...V3, offset: 5 });
report("opponents +3 (stronger league)", { ...V3, offset: -1 });
report("no form swing", { ...V3, amp: 0 });
report("steeper strength mapping (K 0.09)", { ...V3, K: 0.09 });
report("more goals (base 1.3)", { ...V3, base: 1.3 });
report("team +3 on every line", V3, (r) => ({ ...r, att: r.att + 3, mid: r.mid + 3, def: r.def + 3, gk: r.gk + 3 }));

// Win/draw/loss anatomy for the top decile of these XIs.
const top = teams.slice().sort((a, b) => expected(b.r, b.seed, V3).expected - expected(a.r, a.seed, V3).expected).slice(0, Math.ceil(N / 10));
const t0 = top[0]!;
const league = buildLeague(t0.seed, V);
const ti = teamIndices(t0.r);
const vsTier: Record<string, number[]> = {};
for (const opp of league) {
  const m = integrateForm(1.5, (form) => poissonOutcome(
    Math.max(0.08, Math.min(4.2, 1.1 * Math.exp(0.072 * (ti.attack + form - opp.defence)))),
    Math.max(0.08, Math.min(4.2, 1.1 * Math.exp(0.072 * (opp.attack - ti.defence - form)))),
  ));
  (vsTier[opp.def.tier] ??= []).push(m.win, m.draw);
}
console.log(`\nbest competent XI: overall ${t0.r.overall} FIT ${t0.r.fit} → attack idx ${ti.attack.toFixed(1)} defence idx ${ti.defence.toFixed(1)}`);
for (const [tier, xs] of Object.entries(vsTier)) {
  const w = xs.filter((_, i) => i % 2 === 0), d = xs.filter((_, i) => i % 2 === 1);
  console.log(`  vs ${tier}: P(win) ${mean(w).toFixed(2)} P(draw) ${mean(d).toFixed(2)}`);
}
