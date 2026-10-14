import { botChoice } from "@/multiplayer";
import { replayDraft, runSeason, seedFromLabel, ENGINE_VERSION } from "@/engine";
const pts: number[] = [];
for (let k = 0; k < 60; k++) {
  const seed = seedFromLabel(`bot-audit-${k}`);
  const picks: number[] = [];
  for (let r = 0; r < 11; r++) picks.push(botChoice(seed, "433", "liveduel", picks));
  pts.push(runSeason(replayDraft({ seed, formation: "433", mode: "liveduel", engineVersion: ENGINE_VERSION }, picks, null)).points);
}
pts.sort((a, b) => a - b);
const q = (p: number) => pts[Math.floor(p * (pts.length - 1))];
console.log("bot avg", Math.round(pts.reduce((a, b) => a + b) / pts.length), "p10", q(0.1), "p50", q(0.5), "p90", q(0.9));
