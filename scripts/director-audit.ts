/**
 * DRAFT DIRECTOR AUDIT — is each round a real decision, and is the route always there?
 *
 *   node scripts/run-ts.mjs scripts/director-audit.ts [drafts]
 *
 * For every offer met along a competent draft, each option is valued by a rollout: take it,
 * finish the draft competently, and compute the exact expected season points of the final XI.
 * Per round bucket (1–4 variety, 5–8 awareness, 9–11 completion) it reports:
 *  - clear-best: one option beats all others by ≥ 3 expected points (the choice is obvious)
 *  - close call: the two best options are within 1.5 points (a genuine decision)
 *  - star ≠ best: the highest-rated option is not the best one (a star-vs-need trade-off)
 *  - greedy regret: expected points lost by always taking the highest rating
 *  - in position: the offer has at least one option that lands in position
 *  - route: after the pick, a complete in-position XI is still reachable (solvability)
 *  - route offered: whenever a route existed before the round, at least one option keeps it (the guarantee)
 * Adaptive Director (v4 classic) vs the naive draw (same seeds), so the Director's effect is measured.
 */
import {
  ENGINE_VERSION,
  RULESETS,
  autoPlace,
  createDraft,
  currentOffer,
  draftRatings,
  expectedSeason,
  formationOf,
  getFormation,
  isDraftComplete,
  lineupPlayers,
  pickOption,
  previewPick,
  rateLineup,
  solvability,
} from "@/engine";
import { getPlayerEra } from "@/data";
import type { DraftState, FormationId } from "@/types";

const N = Number(process.argv[3] ?? 300);
const V = process.env.V ?? ENGINE_VERSION;
const F: FormationId[] = ["433", "4231", "442", "352", "343", "4312", "532"];

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

const valueAfter = (s: DraftState, i: number): number => {
  let n = pickOption(s, i).state;
  while (!isDraftComplete(n)) n = pickOption(n, competent(n)).state;
  return expectedSeason(draftRatings(n), n.config.seed, V).expected;
};

interface Acc { feasibleBefore: number; routeOffered: number; offers: number; clear: number; close: number; starNotBest: number; regret: number; inPos: number; route: number; directed: number; directedChosen: number }
const blank = (): Acc => ({ feasibleBefore: 0, routeOffered: 0, offers: 0, clear: 0, close: 0, starNotBest: 0, regret: 0, inPos: 0, route: 0, directed: 0, directedChosen: 0 });
const bucketOf = (round: number) => (round < 4 ? "1–4" : round < 8 ? "5–8" : "9–11");

function audit(director: "adaptive" | "naive") {
  (RULESETS.classic as { offerDirector: string }).offerDirector = director;
  const acc: Record<string, Acc> = { "1–4": blank(), "5–8": blank(), "9–11": blank() };
  const finals: { pts: number; oop: number }[] = [];
  for (let k = 0; k < N; k++) {
    let s = createDraft({ seed: `diraudit${k}`, formation: F[k % F.length]!, mode: "classic", engineVersion: V });
    while (!isDraftComplete(s)) {
      const offer = currentOffer(s)!;
      const a = acc[bucketOf(s.round)]!;
      const vals = offer.options.map((id, i) => (lineupPlayers(s).some((x) => x?.playerId === getPlayerEra(id).playerId) ? -Infinity : valueAfter(s, i)));
      const order = vals.map((v, i) => ({ v, i })).sort((x, y) => y.v - x.v);
      const top = order[0]!, second = order[1] ?? { v: -Infinity, i: -1 };
      const star = offer.options.map((id, i) => ({ o: getPlayerEra(id).overall, i })).sort((x, y) => y.o - x.o)[0]!.i;
      a.offers++;
      if (top.v - second.v >= 3) a.clear++;
      if (top.v - second.v <= 1.5) a.close++;
      if (star !== top.i) a.starNotBest++;
      a.regret += top.v - vals[star]!;
      if (offer.options.some((_, i) => previewPick(s, i)?.outOfPosition === false)) a.inPos++;
      if (s.round > 0 && solvability(s).feasible) {
        a.feasibleBefore++;
        const keeps = offer.options.some((id, i) => {
          if (lineupPlayers(s).some((x) => x?.playerId === getPlayerEra(id).playerId)) return false;
          const n = pickOption(s, i).state;
          return isDraftComplete(n) || solvability(n).feasible;
        });
        if (keeps) a.routeOffered++;
      }
      const choice = competent(s);
      if (offer.directed) {
        a.directed++;
        if (offer.options[choice] === offer.directed.playerEraId) a.directedChosen++;
      }
      s = pickOption(s, choice).state;
      if (isDraftComplete(s) || solvability(s).feasible) a.route++;
    }
    const r = draftRatings(s);
    finals.push({ pts: expectedSeason(r, s.config.seed, V).expected, oop: r.outOfPosition });
  }
  const pct = (x: number, n: number) => `${((x / n) * 100).toFixed(0)}%`;
  let md = `### Director: ${director} (${N} competent drafts, 7 formations)\n\n| rounds | offers | clear-best (≥3 pts) | close call (≤1.5 pts) | star ≠ best | greedy regret (pts) | ≥1 in position | route offered (when one existed) | route kept by the pick | directed option | directed chosen |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const [b, a] of Object.entries(acc)) {
    md += `| ${b} | ${a.offers} | ${pct(a.clear, a.offers)} | ${pct(a.close, a.offers)} | ${pct(a.starNotBest, a.offers)} | ${(a.regret / a.offers).toFixed(2)} | ${pct(a.inPos, a.offers)} | ${a.feasibleBefore ? pct(a.routeOffered, a.feasibleBefore) : "—"} | ${pct(a.route, a.offers)} | ${pct(a.directed, a.offers)} | ${a.directed ? pct(a.directedChosen, a.directed) : "—"} |\n`;
  }
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  md += `\nFinal XIs: expected ${mean(finals.map((f) => f.pts)).toFixed(1)} pts · 0 out of position ${pct(finals.filter((f) => f.oop === 0).length, finals.length)} · ≥2 out of position ${pct(finals.filter((f) => f.oop >= 2).length, finals.length)}\n`;
  return md;
}

const t0 = Date.now();
let out = `## Draft Director audit (engine v${V})\n\n`;
out += audit("adaptive") + "\n";
out += audit("naive");
out += `\n(${((Date.now() - t0) / 1000).toFixed(0)}s)\n`;
console.log(out);
