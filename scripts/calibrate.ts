import { createDraft, pickOption, currentOffer, draftRatings, runSeason, freshSeed, ENGINE_VERSION, isDraftComplete, lineupPlayers, autoPlace, getFormation, rateLineup } from "@/engine";
import { getPlayerEra, DATA_STATS } from "@/data";
import type { DraftState, FormationId } from "@/types";

type Strategy = (s: DraftState) => number;
const random: Strategy = () => Math.floor(Math.random() * 4);
const greedy: Strategy = () => 0; // options stored strongest-first
const smart: Strategy = (s) => {
  const offer = currentOffer(s)!;
  const f = getFormation(s.config.formation);
  let best = 0, bestV = -1;
  offer.options.forEach((id, i) => {
    const after = autoPlace(lineupPlayers(s), getPlayerEra(id), f);
    const r = rateLineup(after, f);
    const filled = after.filter(Boolean).length;
    const v = r.overall * filled + r.fit * 0.6 * filled / 11 * 5;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};

const novice: Strategy = (s) => {
  const offer = currentOffer(s)!;
  const f = getFormation(s.config.formation);
  const lineup = lineupPlayers(s);
  let best = 0, bestV = -1;
  offer.options.forEach((id, i) => {
    const p = getPlayerEra(id);
    const after = autoPlace(lineup, p, f);
    const idx = after.findIndex((x) => x?.id === id);
    const slot = f.slots[idx]!;
    const natural = p.positions.includes(slot.position);
    const v = p.overall + (natural ? 20 : 0);
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
};

function run(strategy: Strategy, formation: FormationId, n: number) {
  const pts: number[] = []; const gf: number[] = []; const ga: number[] = []; const dr: number[] = []; const fits: number[] = []; const ovr: number[] = []; const oop: number[] = [];
  let noGk = 0;
  for (let i = 0; i < n; i++) {
    let s = createDraft({ seed: freshSeed(), formation, mode: "classic", engineVersion: ENGINE_VERSION });
    while (!isDraftComplete(s)) s = pickOption(s, strategy(s)).state;
    const r = draftRatings(s);
    const season = runSeason(s);
    pts.push(season.points); gf.push(season.goalsFor/38); ga.push(season.goalsAgainst/38); dr.push(season.draws); fits.push(r.fit); ovr.push(r.overall); oop.push(r.outOfPosition);
    if (lineupPlayers(s)[0]?.positions[0] !== "GK") noGk++;
  }
  const q = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  return `pts avg ${avg(pts)} p10 ${q(pts,.1)} p50 ${q(pts,.5)} p90 ${q(pts,.9)} max ${Math.max(...pts)} | fit ${avg(fits)} (p10 ${q(fits,.1)}) | ovr ${avg(ovr)} | oop ${avg(oop)} | noGK ${noGk} | gf/g ${avg(gf)} ga/g ${avg(ga)} draws ${avg(dr)}`;
}

console.log(DATA_STATS);
for (const f of ["433", "352"] as FormationId[]) {
  console.log(f, "random", run(random, f, 300));
  console.log(f, "greedy", run(greedy, f, 300));
  console.log(f, "novice", run(novice, f, 300));
  console.log(f, "smart ", run(smart, f, 300));
}

