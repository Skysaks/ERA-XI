import { createDraft, pickOption, currentOffer, runSeason, freshSeed, ENGINE_VERSION, isDraftComplete, lineupPlayers, autoPlace, getFormation, rateLineup, generateDraw } from "@/engine";
import { getPlayerEra, playerEraIdsOf, DATA_STATS, ALL_CLUB_ERAS } from "@/data";
import type { DraftState, ModeId } from "@/types";

console.log(DATA_STATS, "club eras by bucket:", Object.fromEntries(["pre1980","1980s","1990s","2000s","2010s","2020s"].map(b=>[b, ALL_CLUB_ERAS.filter(e=>e.kind==="club"&&e.bucket===b).length])));
for (const p of ["messi","maradona","pele","cruyff","cristiano-ronaldo","zidane","ronaldo","kante","salah"]) {
  console.log(p, playerEraIdsOf(p).map(id => { const x = getPlayerEra(id); return `${x.clubEraId}:${x.overall}(${x.level})`; }).join("  "));
}
const smart = (s: DraftState) => {
  const offer = currentOffer(s)!; const f = getFormation(s.config.formation);
  let best = 0, bestV = -1;
  offer.options.forEach((id, i) => { const after = autoPlace(lineupPlayers(s), getPlayerEra(id), f); const r = rateLineup(after, f); const n = after.filter(Boolean).length; const v = r.overall*n + r.fit*0.6*n/11*5; if (v > bestV) { bestV = v; best = i; } });
  return best;
};
for (const mode of ["classic", "eralock", "noreroll"] as ModeId[]) {
  const pts: number[] = []; const t0 = performance.now();
  for (let i = 0; i < 200; i++) { let s = createDraft({ seed: freshSeed(), formation: "433", mode, engineVersion: ENGINE_VERSION }); while (!isDraftComplete(s)) s = pickOption(s, smart(s)).state; pts.push(runSeason(s).points); }
  const ms = (performance.now() - t0) / 200;
  pts.sort((a,b)=>a-b);
  console.log(mode, "smart avg", (pts.reduce((a,b)=>a+b,0)/pts.length).toFixed(1), "p10", pts[20], "p90", pts[180], "ms/run", ms.toFixed(1));
}
// variety: overlap of club eras and players between two random drafts
let eraOverlap = 0, playerOverlap = 0; const N = 300;
for (let i = 0; i < N; i++) {
  const a = generateDraw(freshSeed()), b = generateDraw(freshSeed());
  const ea = new Set(a.rounds.map(r=>r.clubEraId)), eb = b.rounds.map(r=>r.clubEraId);
  eraOverlap += eb.filter(x=>ea.has(x)).length / 11;
  const pa = new Set(a.rounds.flatMap(r=>r.options)), pb = b.rounds.flatMap(r=>r.options);
  playerOverlap += pb.filter(x=>pa.has(x)).length / 44;
}
console.log("avg era overlap between two drafts", (eraOverlap/N*100).toFixed(1)+"%", "player-era overlap", (playerOverlap/N*100).toFixed(1)+"%");
// dilemma: share of offers with ≥2 options within 3 rating points of the best, and ≥3 distinct lines
let close = 0, lines = 0, offers = 0;
for (let i = 0; i < 300; i++) { const d = generateDraw(freshSeed()); for (const r of d.rounds) { offers++; const ps = r.options.map(getPlayerEra); const top = Math.max(...ps.map(p=>p.overall)); if (ps.filter(p=>top-p.overall<=3).length>=2) close++; const ln = new Set(ps.map(p=>p.positions[0])); if (ln.size>=3) lines++; } }
console.log("offers with ≥2 options within 3 pts of best:", (close/offers*100).toFixed(0)+"%", "offers with ≥3 distinct positions:", (lines/offers*100).toFixed(0)+"%");
