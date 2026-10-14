// Average season for a sensible drafter per mode and engine version (calibration check).
import { autoPlace, createDraft, currentOffer, getFormation, isDraftComplete, lineupPlayers, pickOption, rateLineup, runSeason, targetSlot } from "@/engine";
import { getPlayerEra } from "@/data";
import type { DraftState, ModeId } from "@/types";
function greedy(s: DraftState): DraftState {
  const f = getFormation(s.config.formation);
  while (!isDraftComplete(s)) {
    const offer = currentOffer(s)!;
    let best = 0, bestV = -1e9;
    offer.options.forEach((id, i) => {
      const before = lineupPlayers(s);
      if (before.some((p) => p?.playerId === getPlayerEra(id).playerId)) return;
      const t = targetSlot(s);
      const after = t === null ? autoPlace(before, getPlayerEra(id), f) : before.map((p, k) => (k === t ? getPlayerEra(id) : p));
      const r = rateLineup(after, f);
      const n = after.filter(Boolean).length;
      const v = r.overall * n + (r.fit * 3 * n) / 11;
      if (v > bestV) { bestV = v; best = i; }
    });
    s = pickOption(s, best).state;
  }
  return s;
}
const N = 60;
let k0 = 0;
for (const [mode, ev] of [["classic", "3"], ["nations", "3"], ["oneclub", "3"], ["champions", "3"], ["cult", "3"], ["position", "3"], ["gauntlet", "3"], ["eralock", "3"]] as [ModeId, string][]) {
  const pts: number[] = [];
  for (let k = 0; k < N; k++) pts.push(runSeason(greedy(createDraft({ seed: `audit${mode}${k}`, formation: "433", mode, engineVersion: ev }))).points);
  if (k0++ < 3) console.log(mode, pts.slice(0, 6).join(","));
  pts.sort((a, b) => a - b);
  console.log(mode.padEnd(10), "v" + ev, "avg", Math.round(pts.reduce((a, b) => a + b) / N), "p10", pts[6], "p50", pts[30], "p90", pts[54]);
}
