/**
 * Dataset validator. Usage: node scripts/run-ts.mjs scripts/validate-data.ts [file-key ...]
 * file-key = more-1990s, more-nations, … (default: all). Exit code 1 on errors.
 */
import { ERA_FILES } from "@/data/eras";
import { TEAMS } from "@/data/teams";
import { ARCHETYPES, parseOverrides } from "@/data/archetypes";
import { slugify } from "@/data";

const POS = new Set(["GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST"]);
const LINE: Record<string, string> = { GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF", DM: "MID", CM: "MID", AM: "MID", LM: "MID", RM: "MID", LW: "ATT", RW: "ATT", ST: "ATT" };
const teams = new Map(TEAMS.map((t) => [t.id, t]));
const only = process.argv.slice(3);
const errors: string[] = [];
const warnings: string[] = [];

// Who is already known: slug → first appearance (base files only), to flag possible namesakes.
const known = new Map<string, string>();
for (const [file, eras] of Object.entries(ERA_FILES)) {
  if (file.startsWith("world-") || file.startsWith("v2-")) continue;
  for (const e of eras) for (const r of e.players) {
    const p = r.split("|");
    const id = p[5] || slugify(p[0] ?? "");
    if (!known.has(id)) known.set(id, `${e.team} ${e.label}`);
  }
}
const eraKeys = new Map<string, string>();
let eraCount = 0;
let rowCount = 0;
for (const [file, eras] of Object.entries(ERA_FILES)) {
  const check = only.length === 0 || only.includes(file);
  for (const e of eras) {
    const key = `${e.team} ${e.label}`;
    if (eraKeys.has(key)) errors.push(`[${file}] duplicate era ${key} (also in ${eraKeys.get(key)})`);
    eraKeys.set(key, file);
    if (!check) continue;
    eraCount++;
    const where = `[${file}] ${key}`;
    const team = teams.get(e.team);
    if (!team) { errors.push(`${where}: unknown team id "${e.team}"`); continue; }
    const world = file.startsWith("world-") || file.startsWith("v2-"); // V1.8/V2 regional files mix national and club eras
    const nationFile = file === "nations" || file.startsWith("more-nations");
    if (!world && nationFile && team.kind !== "nation") errors.push(`${where}: nations file must use nation teams`);
    if (!world && !nationFile && team.kind !== "club") errors.push(`${where}: club file uses a nation`);
    if (!(e.start <= e.end) || e.start < 1930 || e.end > 2026) errors.push(`${where}: bad start/end`);
    const expectLabel = e.start === e.end ? `${e.start}` : `${e.start}–${e.end}`;
    if (e.label !== expectLabel) errors.push(`${where}: label should be "${expectLabel}" (en dash)`);
    for (const y of e.euro ?? []) if (y < e.start || y > e.end + 1) errors.push(`${where}: euro year ${y} outside the era`);
    if (team.kind === "nation" && e.euro) errors.push(`${where}: euro is for clubs only`);
    const strict = file.startsWith("more-") || world || file === "nations";
    if (strict && (e.players.length < 13 || e.players.length > 18)) errors.push(`${where}: ${e.players.length} players (want 13–18)`);
    const lines: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    const seen = new Set<string>();
    for (const row of e.players) {
      rowCount++;
      const [name, pos, lvl, role, ov, id] = row.split("|");
      if (!name || !pos || !lvl || !role) { errors.push(`${where}: malformed row "${row}"`); continue; }
      if (row.split("|").length > 6) errors.push(`${where}: too many fields "${row}"`);
      const ps = pos.split(" ");
      for (const p of ps) if (!POS.has(p)) errors.push(`${where}: bad position ${p} ("${row}")`);
      const L = LINE[ps[0] ?? ""];
      if (L) lines[L] = (lines[L] ?? 0) + 1;
      if (!(role in ARCHETYPES)) errors.push(`${where}: bad role ${role} ("${row}")`);
      const n = Number(lvl);
      if (!Number.isInteger(n) || n < 60 || n > (file.startsWith("more-") || world ? 98 : 99)) errors.push(`${where}: level ${lvl} outside 68–98 ("${row}")`);
      if ((ps[0] === "GK") !== (role === "GK" || role === "SK")) errors.push(`${where}: GK position/role mismatch ("${row}")`);
      try { parseOverrides(ov); } catch (err) { errors.push(`${where}: ${(err as Error).message} ("${row}")`); }
      const pid = id || slugify(name);
      if (id && !/^[a-z0-9-]+$/.test(id)) errors.push(`${where}: bad id "${id}"`);
      if (seen.has(pid)) errors.push(`${where}: duplicate player ${pid}`);
      seen.add(pid);
      if ((file.startsWith("more-") || world) && known.has(pid)) warnings.push(`${where}: "${name}" matches existing ${pid} (${known.get(pid)}) — same person? if not, add an id`);
    }
    if (!strict) continue;
    if (lines.GK! < 1) errors.push(`${where}: no goalkeeper`);
    if (lines.DEF! < 4) errors.push(`${where}: only ${lines.DEF} defenders (want ≥4)`);
    if (lines.MID! < 3) errors.push(`${where}: only ${lines.MID} midfielders (want ≥3)`);
    if (lines.ATT! < 2) errors.push(`${where}: only ${lines.ATT} attackers (want ≥2)`);
  }
}
console.log(`checked ${eraCount} eras, ${rowCount} rows${only.length ? ` in ${only.join(", ")}` : ""}`);
if (warnings.length) console.log(`\n${warnings.length} namesake notes (fine when it IS the same player):\n` + warnings.join("\n"));
if (errors.length) { console.log(`\n${errors.length} ERRORS:\n` + errors.join("\n")); process.exit(1); }
console.log("OK");
