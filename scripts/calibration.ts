/**
 * CALIBRATION — large-sample diagnostics of the season model on synthetic drafts.
 *
 *   node scripts/run-ts.mjs scripts/calibration.ts [engineVersion] [draftsPerPolicy] [seasonsPerTeam]
 *
 * For every policy it drafts N teams on fresh seeds, then
 *  - samples `seasonsPerTeam` real seasons per team (different seeds)  → sampled distribution
 *  - computes each team's exact points distribution (expectation DP)    → exact tail probabilities
 * and groups results by overall / FIT / ATT / MID / DEF / GK / out-of-position count.
 * Writes a markdown report to $OUT (default calibration-report.md).
 */
import { writeFileSync } from "node:fs";
import {
  ENGINE_VERSION,
  autoPlace,
  createDraft,
  currentOffer,
  draftRatings,
  expectedSeason,
  formationOf,
  freshSeed,
  getFormation,
  isDraftComplete,
  lineupPlayers,
  pickOption,
  rateLineup,
  simulateSeason,
  teamIndices,
} from "@/engine";
import { getPlayerEra } from "@/data";
import type { DraftState, FormationId, TeamRatings } from "@/types";

const VERSION = process.argv[3] ?? ENGINE_VERSION;
const N = Number(process.argv[4] ?? 2000);
const K = Number(process.argv[5] ?? 10);
const OUT = process.env.OUT ?? "calibration-report.md";

type Policy = (s: DraftState) => number;

const random: Policy = (s) => Math.floor(Math.random() * currentOffer(s)!.options.length);
const greedy: Policy = () => 0; // options are stored strongest-first

/** Competent: in-position value + FIT, keeper-aware. */
const competent: Policy = (s) => {
  const offer = currentOffer(s)!;
  const f = getFormation(formationOf(s));
  const before = lineupPlayers(s);
  const hasGk = before.some((p) => p?.positions[0] === "GK");
  const left = 11 - s.round;
  let best = 0, bestV = -Infinity;
  offer.options.forEach((id, i) => {
    const p = getPlayerEra(id);
    if (before.some((x) => x?.playerId === p.playerId)) return;
    const after = autoPlace(before, p, f);
    const r = rateLineup(after, f, s.config.engineVersion);
    const filled = after.filter(Boolean).length;
    let v = r.overall * filled + r.fit * 0.6 * (filled / 11) * 5;
    if (!hasGk && p.positions[0] === "GK" && left <= 5) v += 400;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};

/** Expert: judges each option by the team strength it leads to (attack + defence indices). */
const expert: Policy = (s) => {
  const offer = currentOffer(s)!;
  const f = getFormation(formationOf(s));
  const before = lineupPlayers(s);
  const hasGk = before.some((p) => p?.positions[0] === "GK");
  const left = 11 - s.round;
  let best = 0, bestV = -Infinity;
  offer.options.forEach((id, i) => {
    const p = getPlayerEra(id);
    if (before.some((x) => x?.playerId === p.playerId)) return;
    const after = autoPlace(before, p, f);
    const r = rateLineup(after, f, s.config.engineVersion);
    const t = teamIndices(r);
    const filled = after.filter(Boolean).length;
    let v = (t.attack + t.defence) * filled + r.fit * 0.4 * filled;
    if (!hasGk && p.positions[0] === "GK" && left <= 4) v += 1000;
    if (!hasGk && p.positions[0] === "GK" && s.round >= 2) v += 40;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};

/** Novice: the highest rating that lands in position, otherwise simply the highest rating. */
const novice: Policy = (s) => {
  const offer = currentOffer(s)!;
  const f = getFormation(formationOf(s));
  const before = lineupPlayers(s);
  let best = 0, bestV = -Infinity;
  offer.options.forEach((id, i) => {
    const p = getPlayerEra(id);
    if (before.some((x) => x?.playerId === p.playerId)) return;
    const after = autoPlace(before, p, f);
    const slot = f.slots[after.findIndex((x) => x?.id === id)]!;
    const v = p.overall + (p.positions.includes(slot.position) ? 20 : 0);
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};

const POLICIES: Record<string, Policy> = { random, greedy, novice, competent, expert };
const FORMATIONS: FormationId[] = ["433", "4231", "442", "352", "343"];

interface Row {
  policy: string;
  r: TeamRatings;
  sampled: number[];
  exact: { exp: number; p100: number; p105: number; p110: number; p111: number; p112: number; p113: number; p114: number };
  gf: number;
  ga: number;
  w: number;
  d: number;
  l: number;
}

const rows: Row[] = [];
const t0 = Date.now();
for (const [name, policy] of Object.entries(POLICIES)) {
  for (let i = 0; i < N; i++) {
    const formation = FORMATIONS[i % FORMATIONS.length]!;
    let s = createDraft({ seed: freshSeed(), formation, mode: "classic", engineVersion: VERSION });
    while (!isDraftComplete(s)) s = pickOption(s, policy(s)).state;
    const r = draftRatings(s);
    const sampled: number[] = [];
    let gf = 0, ga = 0, w = 0, d = 0, l = 0;
    for (let k = 0; k < K; k++) {
      const res = simulateSeason({ ratings: r, seed: freshSeed(), engineVersion: VERSION });
      sampled.push(res.points);
      gf += res.goalsFor; ga += res.goalsAgainst; w += res.wins; d += res.draws; l += res.losses;
    }
    const e = expectedSeason(r, s.config.seed, VERSION);
    rows.push({
      policy: name,
      r,
      sampled,
      exact: { exp: e.expected, p100: e.atLeast(100), p105: e.atLeast(105), p110: e.atLeast(110), p111: e.atLeast(111), p112: e.atLeast(112), p113: e.atLeast(113), p114: e.atLeast(114) },
      gf: gf / K, ga: ga / K, w: w / K, d: d / K, l: l / K,
    });
  }
  console.error(`${name}: ${N} drafts × ${K} seasons (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

const pct = (x: number) => (x * 100 >= 1 ? `${(x * 100).toFixed(1)}%` : x * 100 >= 0.01 ? `${(x * 100).toFixed(2)}%` : x > 0 ? `${(x * 100).toExponential(1)}%` : "0");
const q = (xs: number[], p: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))] ?? 0; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

let md = `# ERA XI calibration — engine v${VERSION}\n\n${N} synthetic drafts per policy × ${K} sampled seasons each (${N * K * Object.keys(POLICIES).length} season samples), plus the exact points distribution of every drafted team.\n\n`;
md += `## Score distribution by drafting policy (sampled seasons)\n\n| policy | mean | p10 | p50 | p90 | max | <80 | 80–89 | 90–99 | ≥100 | ≥105 | ≥110 | ≥111 | ≥112 | =113 | 114 | W-D-L | GF/GA per game |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const name of Object.keys(POLICIES)) {
  const rs = rows.filter((r) => r.policy === name);
  const all = rs.flatMap((r) => r.sampled);
  const share = (k: number) => pct(all.filter((x) => x >= k).length / all.length);
  const band = (lo: number, hi: number) => pct(all.filter((x) => x >= lo && x < hi).length / all.length);
  md += `| ${name} | ${mean(all).toFixed(1)} | ${q(all, 0.1)} | ${q(all, 0.5)} | ${q(all, 0.9)} | ${Math.max(...all)} | ${band(0, 80)} | ${band(80, 90)} | ${band(90, 100)} | ${share(100)} | ${share(105)} | ${share(110)} | ${share(111)} | ${share(112)} | ${pct(all.filter((x) => x === 113).length / all.length)} | ${share(114)} | ${mean(rs.map((r) => r.w)).toFixed(1)}-${mean(rs.map((r) => r.d)).toFixed(1)}-${mean(rs.map((r) => r.l)).toFixed(1)} | ${(mean(rs.map((r) => r.gf)) / 38).toFixed(2)} / ${(mean(rs.map((r) => r.ga)) / 38).toFixed(2)} |\n`;
}
md += `\n## Exact tails (expectation DP over every drafted XI, no sampling noise)\n\n| policy | exact mean | ≥100 | ≥105 | ≥110 | ≥111 | ≥112 | 114 |\n|---|---|---|---|---|---|---|---|\n`;
for (const name of Object.keys(POLICIES)) {
  const rs = rows.filter((r) => r.policy === name);
  md += `| ${name} | ${mean(rs.map((r) => r.exact.exp)).toFixed(1)} | ${pct(mean(rs.map((r) => r.exact.p100)))} | ${pct(mean(rs.map((r) => r.exact.p105)))} | ${pct(mean(rs.map((r) => r.exact.p110)))} | ${pct(mean(rs.map((r) => r.exact.p111)))} | ${pct(mean(rs.map((r) => r.exact.p112)))} | ${pct(mean(rs.map((r) => r.exact.p114)))} |\n`;
}
md += `\n113 is arithmetically impossible over 38 games (37W 1D = 112, 38W = 114), so "≥113" equals "114".\n`;

const group = (label: string, key: (r: TeamRatings) => number, edges: number[]) => {
  md += `\n## By ${label} (all policies)\n\n| ${label} | teams | mean pts | p10 | p90 | W-D-L | GF / GA per season | exact ≥100 | exact ≥105 | exact ≥110 | exact 114 |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (let i = 0; i < edges.length; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1] ?? Infinity;
    const rs = rows.filter((r) => key(r.r) >= lo && key(r.r) < hi);
    if (!rs.length) continue;
    const all = rs.flatMap((r) => r.sampled);
    md += `| ${hi === Infinity ? `≥${lo}` : `${lo}–${hi - 1}`} | ${rs.length} | ${mean(all).toFixed(1)} | ${q(all, 0.1)} | ${q(all, 0.9)} | ${mean(rs.map((r) => r.w)).toFixed(1)}-${mean(rs.map((r) => r.d)).toFixed(1)}-${mean(rs.map((r) => r.l)).toFixed(1)} | ${mean(rs.map((r) => r.gf)).toFixed(0)} / ${mean(rs.map((r) => r.ga)).toFixed(0)} | ${pct(mean(rs.map((r) => r.exact.p100)))} | ${pct(mean(rs.map((r) => r.exact.p105)))} | ${pct(mean(rs.map((r) => r.exact.p110)))} | ${pct(mean(rs.map((r) => r.exact.p114)))} |\n`;
  }
};
group("overall", (r) => r.overall, [0, 70, 75, 80, 83, 86, 88, 90, 92]);
group("FIT", (r) => r.fit, [0, 50, 60, 70, 80, 85, 90, 95]);
group("ATT", (r) => r.att, [0, 75, 80, 85, 88, 91, 94]);
group("MID", (r) => r.mid, [0, 75, 80, 85, 88, 91, 94]);
group("DEF", (r) => r.def, [0, 75, 80, 85, 88, 91, 94]);
group("GK", (r) => r.gk, [0, 40, 70, 80, 85, 88, 91]);
group("out of position", (r) => r.outOfPosition, [0, 1, 2, 3, 4, 6]);

// Reference XIs: what the model allows at the very top (exact, averaged over 200 seeds).
const ref = (label: string, r: TeamRatings) => {
  const ds = Array.from({ length: 200 }, () => expectedSeason(r, freshSeed(), VERSION));
  md += `| ${label} | ${r.overall} | ${r.fit} | ${mean(ds.map((d) => d.expected)).toFixed(1)} | ${pct(mean(ds.map((d) => d.atLeast(100))))} | ${pct(mean(ds.map((d) => d.atLeast(110))))} | ${pct(mean(ds.map((d) => d.atLeast(114))))} |\n`;
};
const dims = (v: number) => ({ width: v, finishing: v + 3, creation: v + 3, progression: v, retention: v + 1, coverage: v, ballWinning: v, pace: v, aerial: v - 4, buildUp: v });
md += `\n## Reference XIs (exact expectation, 200 seeds)\n\n| XI | overall | FIT | exp. pts | ≥100 | ≥110 | 114 |\n|---|---|---|---|---|---|---|\n`;
ref("perfect: elite and coherent", { att: 94, mid: 93, def: 92, gk: 93, overall: 93, fit: 98, dims: dims(92), outOfPosition: 0, overlap: 0 });
ref("great", { att: 91, mid: 90, def: 89, gk: 90, overall: 90, fit: 94, dims: dims(89), outOfPosition: 0, overlap: 0 });
ref("perfect names, poor fit", { att: 94, mid: 93, def: 92, gk: 93, overall: 93, fit: 70, dims: dims(84), outOfPosition: 3, overlap: 2 });
ref("typical competent", { att: 89, mid: 87, def: 85, gk: 87, overall: 87, fit: 92, dims: dims(86), outOfPosition: 0, overlap: 0 });

writeFileSync(OUT, md);
console.log(md);
