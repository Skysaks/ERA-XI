import { ERA_FILES } from "@/data/eras";
import { TEAMS } from "@/data/teams";
const kind = new Map(TEAMS.map((t) => [t.id, t.kind]));
let clubs = 0, nations = 0, euro = 0, rows = 0;
const perTeam = new Map<string, number>();
const buckets: Record<string, number> = {};
for (const eras of Object.values(ERA_FILES)) for (const e of eras) {
  rows += e.players.length;
  if (kind.get(e.team) === "nation") nations++; else { clubs++; perTeam.set(e.team, (perTeam.get(e.team) ?? 0) + 1); const mid = (e.start + e.end) / 2; const b = mid < 1980 ? "pre1980" : mid < 1990 ? "1980s" : mid < 2000 ? "1990s" : mid < 2010 ? "2000s" : mid < 2020 ? "2010s" : "2020s"; buckets[b] = (buckets[b] ?? 0) + 1; }
  if (e.euro?.length) euro++;
}
console.log({ clubs, nations, euro, rows, teams: TEAMS.length, clubTeams: TEAMS.filter(t=>t.kind==="club").length, buckets });
console.log([...perTeam].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([t,n])=>`${t}:${n}`).join(" "));
console.log("euro eras:", Object.values(ERA_FILES).flat().filter(e=>e.euro?.length).map(e=>`${e.team} ${e.label} ${e.euro}`).join(" | "));
console.log("teams w/o eras:", TEAMS.filter(t=>!perTeam.has(t.id) && t.kind==="club").map(t=>t.id).join(" "));
