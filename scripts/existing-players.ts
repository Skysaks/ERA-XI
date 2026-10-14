/** Regenerates data-authoring/existing-players.txt: every identity, its id and its eras (for authors). */
import { writeFileSync } from "node:fs";
import { ALL_PLAYER_IDS, getClubEra, getPlayer, getPlayerEra, playerEraIdsOf } from "@/data";
const lines = ALL_PLAYER_IDS.map((pid) => {
  const vs = playerEraIdsOf(pid).map((id) => {
    const p = getPlayerEra(id);
    const e = getClubEra(p.clubEraId);
    return `${e.clubId} ${e.label} (${p.overall}, ${p.positions.join(" ")})`;
  });
  return `${getPlayer(pid)!.name} [${pid}] — ${vs.join("; ")}`;
}).sort((a, b) => a.localeCompare(b));
writeFileSync("data-authoring/existing-players.txt", lines.join("\n") + "\n");
console.log(lines.length, "players");
