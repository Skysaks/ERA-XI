/**
 * v4 per-factor diagnosis — which factor moves the 114-point experience, one at a time.
 *
 *   node scripts/run-ts.mjs scripts/calibration-v4-diagnose.ts [drafts]
 *
 * A fixed population of competently drafted v4 XIs; every row changes ONE factor and reports
 * the exact expectation (no sampling noise): draft quality (Director, solvability protection,
 * hindsight ceiling), FIT penalties, positional arrangement, opponent strength, expected-goals
 * scaling, season variance, strength mapping.
 */
import {
  ENGINE_VERSION,
  RULESETS, V4_PARAMS, autoPlace, buildLeague, createDraft, currentOffer, draftRatings, eliteness, expectedSeason, formationOf,
  getFormation, integrateForm, isDraftComplete, lineupPlayers, optimiseXI, applyProjection, pickOption, poissonOutcome, rateLineup,
  seasonDistribution, teamIndices,
} from "@/engine";
import { getPlayerEra } from "@/data";
import type { DraftState, FormationId, TeamRatings } from "@/types";

const N = Number(process.argv[3] ?? 500);
const V = process.env.V ?? ENGINE_VERSION;
const F: FormationId[] = ["433", "4231", "442", "352", "343"];

function competent(s: DraftState): number {
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
}

/** Hindsight beam over the offers actually shown (adaptive offers depend on the drafted set). */
function beam(seed: string, formation: FormationId, width = 30): DraftState {
  let states: DraftState[] = [createDraft({ seed, formation, mode: "classic", engineVersion: V })];
  for (let round = 0; round < 11; round++) {
    const next: { s: DraftState; v: number }[] = [];
    for (const s of states) {
      currentOffer(s)!.options.forEach((id, i) => {
        if (lineupPlayers(s).some((x) => x?.playerId === getPlayerEra(id).playerId)) return;
        const n = pickOption(s, i).state;
        const t = teamIndices(draftRatings(n));
        next.push({ s: n, v: t.attack + t.defence + n.lineup.filter(Boolean).length * 3 });
      });
    }
    next.sort((a, b) => b.v - a.v);
    states = next.slice(0, width).map((x) => x.s);
  }
  return states[0]!;
}

const draftWith = (seed: string, formation: FormationId, director: "adaptive" | "naive", protect: boolean) => {
  const rs = RULESETS.classic as { offerDirector: string; protectSolvability: boolean };
  const keep = { d: rs.offerDirector, p: rs.protectSolvability };
  rs.offerDirector = director;
  rs.protectSolvability = protect;
  let s = createDraft({ seed, formation, mode: "classic", engineVersion: V });
  while (!isDraftComplete(s)) s = pickOption(s, competent(s)).state;
  rs.offerDirector = keep.d;
  rs.protectSolvability = keep.p;
  return s;
};

interface P { offset: number; K: number; base: number; amp: number; eliteAmp: number; eliteControl: number; fitScale: number }
const P0: P = { offset: V4_PARAMS.offset, K: V4_PARAMS.K, base: V4_PARAMS.base, amp: V4_PARAMS.amp, eliteAmp: V4_PARAMS.eliteAmp, eliteControl: V4_PARAMS.eliteControl, fitScale: 1 };

/** The v4 model with every factor exposed (P0 reproduces expectedSeasonV4 exactly; checked below). */
function dist(r0: TeamRatings, seed: string, p: P) {
  const r = { ...r0, fit: 100 - (100 - r0.fit) * p.fitScale };
  const league = buildLeague(seed, V).map((o) => ({ ...o, attack: o.attack + 2 - p.offset, defence: o.defence + 2 - p.offset }));
  const { attack, defence } = teamIndices(r);
  const e = eliteness(attack, defence);
  const amp = p.amp * (1 - p.eliteAmp * e);
  const ms = [];
  for (let h = 0; h < 2; h++)
    for (const o of league) {
      const home = h === 0;
      ms.push(
        integrateForm(amp, (form) => {
          const edge = Math.max(0, attack + form - o.defence);
          return poissonOutcome(
            Math.max(0.08, Math.min(4.6, p.base * Math.exp(p.K * (attack + form - o.defence)) * (home ? 1.1 : 0.92))),
            Math.max(0.05, Math.min(4.6, p.base * Math.exp(p.K * (o.attack - defence - form) - p.eliteControl * e * edge) * (home ? 0.92 : 1.1))),
          );
        }),
      );
    }
  return seasonDistribution(ms);
}

const t0 = Date.now();
const pop: { seed: string; formation: FormationId; s: DraftState; r: TeamRatings }[] = [];
for (let i = 0; i < N; i++) {
  const seed = `v4diag${i}`;
  const formation = F[i % F.length]!;
  const s = draftWith(seed, formation, "adaptive", true);
  pop.push({ seed, formation, s, r: draftRatings(s) });
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x: number) => (x >= 0.01 ? `${(x * 100).toFixed(1)}%` : x >= 0.0001 ? `${(x * 100).toFixed(2)}%` : x > 0 ? `${(x * 100).toExponential(1)}%` : "0");

// Sanity: the exposed model equals the shipped one.
const drift = Math.max(...pop.slice(0, 30).map((t) => Math.abs(dist(t.r, t.seed, P0).expected - expectedSeason(t.r, t.seed, V).expected)));
if (drift > 1e-6) throw new Error(`diagnostic model drifted from expectedSeasonV4 by ${drift}`);

let md = `## v4 per-factor diagnosis (${N} competent XIs, exact expectation)\n\n`;
md += `Population: overall ${mean(pop.map((t) => t.r.overall)).toFixed(1)} · FIT ${mean(pop.map((t) => t.r.fit)).toFixed(1)} · out of position ${mean(pop.map((t) => t.r.outOfPosition)).toFixed(2)}\n\n`;
md += `| factor changed | overall | FIT | OOP | exp. pts | ≥100 | ≥105 | ≥110 | ≥112 | 114 |\n|---|---|---|---|---|---|---|---|---|---|\n`;
const row = (label: string, items: { r: TeamRatings; seed: string }[], p: P = P0) => {
  const ds = items.map((t) => dist(t.r, t.seed, p));
  md += `| ${label} | ${mean(items.map((t) => t.r.overall)).toFixed(1)} | ${mean(items.map((t) => t.r.fit)).toFixed(1)} | ${mean(items.map((t) => t.r.outOfPosition)).toFixed(2)} | ${mean(ds.map((d) => d.expected)).toFixed(1)} | ${pct(mean(ds.map((d) => d.atLeast(100))))} | ${pct(mean(ds.map((d) => d.atLeast(105))))} | ${pct(mean(ds.map((d) => d.atLeast(110))))} | ${pct(mean(ds.map((d) => d.atLeast(112))))} | ${pct(mean(ds.map((d) => d.atLeast(114))))} |\n`;
};

row("**v4 as shipped** (adaptive Director, protection on)", pop);
md += `| *draft quality* |||||||||| \n`;
row("naive draw (no Director), same seeds", pop.map((t) => ({ seed: t.seed, r: draftRatings(draftWith(t.seed, t.formation, "naive", false)) })));
row("Director without solvability protection", pop.map((t) => ({ seed: t.seed, r: draftRatings(draftWith(t.seed, t.formation, "adaptive", false)) })));
const ceilingN = Math.min(N, 150);
row(`hindsight ceiling (beam search, ${ceilingN} draws)`, pop.slice(0, ceilingN).map((t) => ({ seed: t.seed, r: draftRatings(beam(t.seed, t.formation)) })));
md += `| *positional / FIT* |||||||||| \n`;
row("OPTIMISE XI applied after the draft", pop.map((t) => {
  const o = optimiseXI(t.s);
  return { seed: t.seed, r: o ? draftRatings(applyProjection(t.s, o.after)) : t.r };
}));
row("FIT penalty halved", pop, { ...P0, fitScale: 0.5 });
row("FIT penalty removed (FIT = 100)", pop, { ...P0, fitScale: 0 });
md += `| *opponents* |||||||||| \n`;
row("opponents −2 (weaker league)", pop, { ...P0, offset: P0.offset + 2 });
row("opponents +2 (stronger league)", pop, { ...P0, offset: P0.offset - 2 });
md += `| *expected goals* |||||||||| \n`;
row("goal scale ×0.9 (base 0.99)", pop, { ...P0, base: P0.base * 0.9 });
row("goal scale ×1.15 (base 1.27)", pop, { ...P0, base: P0.base * 1.15 });
row("steeper strength mapping (K 0.085)", pop, { ...P0, K: 0.085 });
md += `| *variance* |||||||||| \n`;
row("no form swing (amp 0)", pop, { ...P0, amp: 0 });
row("double form swing (amp 3)", pop, { ...P0, amp: 3 });
row("no elite control", pop, { ...P0, eliteAmp: 0, eliteControl: 0 });
md += `\n(${((Date.now() - t0) / 1000).toFixed(0)}s)\n`;
console.log(md);
