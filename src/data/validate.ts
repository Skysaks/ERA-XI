/**
 * DATASET VALIDATION — one function, used by `scripts/data-audit.ts` (report), `scripts/validate-data.ts`
 * (authoring) and `tests/data-integrity.test.ts` (CI: `npm test` fails on any critical error).
 *
 * Errors are critical: a draw could break, a fact could be false, or two entities collide.
 * Warnings are editorial: plausible but worth a human look (namesakes, rating jumps, thin eras).
 * Never imported by the app: no bundle cost.
 */
import { ALL_CLUB_ERAS, ALL_PLAYER_IDS, getClub, getPlayerEra, loadNationality, nationOf, playerEraIdsOf } from "@/data";
import { TEAMS } from "@/data/teams";
import { ERA_META } from "@/data/eraMeta";
import { NATION_ERA_RESULTS } from "@/knowledge/facts";
import { HISTORICAL_NATIONS, ISO2 } from "@/knowledge/nations";
import { ATTRIBUTE_KEYS, type Position, type Role } from "@/types";

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  /** Counts per check, for the report ("checked N …"). */
  checked: { eras: number; playerEras: number; identities: number; teams: number; eraMeta: number; nationResults: number };
}

const LINE: Record<Position, "GK" | "DEF" | "MID" | "ATT"> = {
  GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF", DM: "MID", CM: "MID", AM: "MID", LM: "MID", RM: "MID", LW: "ATT", RW: "ATT", ST: "ATT",
};
/** Natural positions each role archetype is meant for. */
export const ROLE_POSITIONS: Record<Role, Position[]> = {
  GK: ["GK"], SK: ["GK"],
  BPD: ["CB", "DM"], STP: ["CB"],
  FB: ["LB", "RB", "LWB", "RWB"], DFB: ["LB", "RB", "CB", "LWB", "RWB"], WB: ["LWB", "RWB", "LB", "RB", "LM", "RM"],
  ANC: ["DM", "CM", "CB"], BW: ["DM", "CM"], DLP: ["DM", "CM"], B2B: ["CM", "DM", "AM", "LM", "RM"],
  PM: ["AM", "CM", "LM", "RM", "LW", "RW"],
  WNG: ["LW", "RW", "LM", "RM"], IF: ["LW", "RW", "ST", "AM"],
  TM: ["ST"], PCH: ["ST"], F9: ["ST", "AM"], CF: ["ST", "AM"], PRS: ["ST", "LW", "RW"],
};
const NATION_CODES = new Set<string>([...Object.keys(ISO2), ...HISTORICAL_NATIONS]);
const FIRST_YEAR = 1930;
const LAST_YEAR = 2026;
/** Tournaments named after one year but played in another (the pandemic editions). */
const PLAYED_IN: Record<string, number> = { "euro:2020": 2021, "olympics:2020": 2021 };
const TOURNAMENT_HONOUR: Record<string, string> = { wc: "world-cup", euro: "euro", copa: "copa-america", afcon: "afcon", olympics: "olympics" };

export async function validateDataset(): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const eraById = new Map(ALL_CLUB_ERAS.map((e) => [e.id, e]));

  // ── teams ──
  const teamIds = new Set<string>();
  for (const t of TEAMS) {
    if (teamIds.has(t.id)) errors.push(`team id "${t.id}" defined twice`);
    teamIds.add(t.id);
    if (!/^[a-z0-9-]+$/.test(t.id)) errors.push(`team id "${t.id}": lowercase letters, digits and dashes only`);
    if (!NATION_CODES.has(t.country)) errors.push(`team "${t.name}": unknown country code ${t.country}`);
    if (!/^#[0-9A-Fa-f]{6}$/.test(t.color)) errors.push(`team "${t.name}": colour ${t.color} is not #RRGGBB`);
    if (!t.name.trim() || !t.shortName.trim()) errors.push(`team "${t.id}": empty name`);
  }

  // ── eras & PlayerEras ──
  const teamEras = new Map<string, number>();
  const playerEraIds = new Set<string>();
  let playerEraCount = 0;
  for (const e of ALL_CLUB_ERAS) {
    if (!teamIds.has(e.clubId)) {
      errors.push(`era ${e.id}: unknown team "${e.clubId}"`);
      continue;
    }
    const team = getClub(e.clubId);
    teamEras.set(team.id, (teamEras.get(team.id) ?? 0) + 1);
    const where = `${team.name} ${e.label}`;
    if (!Number.isInteger(e.startYear) || !Number.isInteger(e.endYear)) errors.push(`${where}: non-integer years`);
    if (e.startYear > e.endYear) errors.push(`${where}: starts after it ends`);
    if (e.endYear > LAST_YEAR || e.startYear < FIRST_YEAR) errors.push(`${where}: years outside ${FIRST_YEAR}–${LAST_YEAR}`);
    const expectLabel = e.startYear === e.endYear ? `${e.startYear}` : `${e.startYear}–${e.endYear}`;
    if (e.label !== expectLabel) errors.push(`${where}: label should read "${expectLabel}"`);
    for (const y of e.europeanCups) if (y < e.startYear || y > e.endYear + 1) errors.push(`${where}: European Cup ${y} outside the era`);
    if (team.kind === "club" && e.endYear - e.startYear > 8) warnings.push(`${where}: era spans ${e.endYear - e.startYear} years (one squad rarely lasts that long)`);
    if (team.kind === "nation" && e.endYear - e.startYear > 4) warnings.push(`${where}: national era spans ${e.endYear - e.startYear} years`);

    const ps = e.playerEraIds.map(getPlayerEra);
    const lines = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (const p of ps) {
      playerEraCount++;
      if (playerEraIds.has(p.id)) errors.push(`duplicate PlayerEra id ${p.id}`);
      playerEraIds.add(p.id);
      const who = `${where} ${p.name}`;
      if (!p.positions.length) {
        errors.push(`${who}: no position`);
        continue;
      }
      lines[LINE[p.positions[0]!]]++;
      if (p.positions.length !== new Set(p.positions).size) errors.push(`${who}: repeated position`);
      const role = p.roles[0] as Role | undefined;
      if (!role) errors.push(`${who}: missing role`);
      else if (!ROLE_POSITIONS[role].includes(p.positions[0]!)) {
        const gkMismatch = (role === "GK" || role === "SK") !== (p.positions[0] === "GK");
        (gkMismatch ? errors : warnings).push(`${who}: role ${role} for a natural ${p.positions[0]}`);
      }
      if (p.positions.includes("GK") && p.positions.length > 1) errors.push(`${who}: goalkeeper listed with outfield positions`);
      // Attributes and ratings: finite integers on the 1–99 scale.
      for (const k of ATTRIBUTE_KEYS) {
        const v = p[k];
        if (!Number.isFinite(v) || v < 1 || v > 99) errors.push(`${who}: ${k} = ${v} (outside 1–99)`);
      }
      if (!Number.isInteger(p.overall) || p.overall < 40 || p.overall > 99) errors.push(`${who}: overall ${p.overall} is not a valid rating`);
      if (!Number.isInteger(p.level) || p.level < 50 || p.level > 99) errors.push(`${who}: authored level ${p.level} outside 50–99`);
      if (p.positions[0] === "GK" && p.goalkeeping < 60) errors.push(`${who}: keeper with goalkeeping ${p.goalkeeping}`);
      if (p.positions[0] !== "GK" && p.goalkeeping > 30) errors.push(`${who}: outfielder with goalkeeping ${p.goalkeeping}`);
      if (Math.abs(p.overall - p.level) > 6) warnings.push(`${who}: displayed ${p.overall} vs authored level ${p.level} (profile drift ${p.overall - p.level})`);
      if (p.overall > 97 || p.overall < 72) warnings.push(`${who}: overall ${p.overall} at the edge of the scale`);
    }
    // Enough players in every line for the draw to offer real choices.
    if (lines.GK < 1) errors.push(`${where}: no goalkeeper`);
    if (lines.DEF < 3 || lines.MID < 2 || lines.ATT < 1) errors.push(`${where}: too thin to offer real choices (${JSON.stringify(lines)})`);
    else if (lines.MID < 3) warnings.push(`${where}: thin midfield (${JSON.stringify(lines)})`);
    if (lines.GK > 3) warnings.push(`${where}: ${lines.GK} goalkeepers`);
    if (ps.length < 12) warnings.push(`${where}: only ${ps.length} players (candidate diversity)`);
    const roles = new Set(ps.map((p) => p.roles[0]));
    if (roles.size < 6) warnings.push(`${where}: only ${roles.size} distinct roles`);
  }
  for (const t of TEAMS) if (!teamEras.has(t.id)) warnings.push(`team "${t.name}" has no era (historical reference without players)`);

  // ── identities (the same person across eras) ──
  await loadNationality();
  for (const pid of ALL_PLAYER_IDS) {
    const ids = playerEraIdsOf(pid);
    const ps = ids.map(getPlayerEra);
    const eras = ids.map((id) => eraById.get(id.slice(0, id.indexOf(":")))!);
    if (new Set(ps.map((p) => p.name)).size > 1) errors.push(`${pid}: one identity, several names (${[...new Set(ps.map((p) => p.name))].join(" / ")})`);
    const span = Math.max(...eras.map((e) => e.endYear)) - Math.min(...eras.map((e) => e.startYear));
    if (span > 22) warnings.push(`${pid}: versions span ${span} years — check for a namesake (${eras.map((e) => `${getClub(e.clubId).name} ${e.label}`).join("; ")})`);
    const squadNations = new Set(eras.filter((e) => e.kind === "nation").map((e) => getClub(e.clubId).country));
    if (squadNations.size > 1) warnings.push(`${pid}: in the squads of ${[...squadNations].join(" and ")} — namesake or dual international?`);
    const clubs = eras.filter((e) => e.kind === "club");
    for (let i = 0; i < clubs.length; i++)
      for (let j = i + 1; j < clubs.length; j++) {
        const a = clubs[i]!, b = clubs[j]!;
        if (a.clubId === b.clubId) continue;
        const overlap = Math.min(a.endYear, b.endYear) - Math.max(a.startYear, b.startYear);
        if (overlap >= 2) warnings.push(`${pid}: at ${getClub(a.clubId).name} ${a.label} and ${getClub(b.clubId).name} ${b.label} at the same time`);
      }
    const byTime = ps.map((p, k) => ({ p, e: eras[k]! })).sort((x, y) => x.e.startYear - y.e.startYear);
    for (let k = 1; k < byTime.length; k++) {
      const a = byTime[k - 1]!, b = byTime[k]!;
      if (b.e.startYear - a.e.endYear <= 3 && Math.abs(b.p.overall - a.p.overall) > 7)
        warnings.push(`${pid}: ${a.p.overall} (${getClub(a.e.clubId).name} ${a.e.label}) → ${b.p.overall} (${getClub(b.e.clubId).name} ${b.e.label}) within ${b.e.startYear - a.e.endYear} years`);
    }
    // Nationality references.
    const n = nationOf(pid);
    if (n) for (const c of n.codes) if (!NATION_CODES.has(c)) errors.push(`${pid}: unknown nationality code ${c}`);
    // A player in a national squad must carry that nation (when his nationality is recorded).
    if (n && squadNations.size === 1) {
      const squad = [...squadNations][0]!;
      if (!n.codes.includes(squad)) warnings.push(`${pid}: plays for ${squad} but nationality says ${n.codes.join("/")}`);
    }
  }

  // ── era context (coach, honours) ──
  let eraMeta = 0;
  for (const [id, m] of Object.entries(ERA_META)) {
    eraMeta++;
    const e = eraById.get(id);
    if (!e) {
      errors.push(`era context "${id}": no such era`);
      continue;
    }
    const where = `era context ${id}`;
    if (!m.src.length || m.src.some((u) => !/^https:\/\//.test(u))) errors.push(`${where}: every fact needs an https source`);
    if (m.coach.length > 2 || m.coach.some((c) => !c.trim())) errors.push(`${where}: coach list must hold 1–2 names`);
    const seen = new Set<string>();
    for (const [code, year] of m.honours) {
      if (year < e.startYear || year > e.endYear + 1) errors.push(`${where}: ${code} ${year} outside the era (${e.label})`);
      const k = `${code}:${year}`;
      // Split-season leagues (Apertura/Clausura, Prode…) can crown the same club twice in a year.
      if (seen.has(k)) (code === "league" ? warnings : errors).push(`${where}: ${code} ${year} listed twice${code === "league" ? " (fine for split seasons)" : ""}`);
      seen.add(k);
      const nationOnly = ["world-cup", "euro", "copa-america", "afcon", "asian-cup", "gold-cup"].includes(code);
      if (nationOnly && e.kind !== "nation") errors.push(`${where}: ${code} is a national-team honour on a club era`);
      if (!nationOnly && code !== "olympics" && e.kind === "nation") errors.push(`${where}: club honour ${code} on a national era`);
    }
  }

  // ── tournament results of national eras ──
  let nationResults = 0;
  for (const [id, r] of Object.entries(NATION_ERA_RESULTS)) {
    nationResults++;
    const e = eraById.get(id);
    if (!e) errors.push(`tournament result "${id}": no such era`);
    else {
      if (e.kind !== "nation") errors.push(`tournament result ${id}: not a national era`);
      const played = PLAYED_IN[`${r.tournament}:${r.year}`] ?? r.year;
      if (played < e.startYear || played > e.endYear + 1) errors.push(`tournament result ${id}: ${r.tournament} ${r.year} outside ${e.label}`);
      // A win must agree with the honours list when the era has context.
      const meta = ERA_META[id];
      if (meta && r.finish === "winner" && !meta.honours.some(([c, y]) => c === TOURNAMENT_HONOUR[r.tournament] && y === r.year))
        errors.push(`tournament result ${id}: ${r.tournament} ${r.year} winner, but the era context does not list it`);
    }
  }

  return {
    errors,
    warnings,
    checked: { eras: ALL_CLUB_ERAS.length, playerEras: playerEraCount, identities: ALL_PLAYER_IDS.length, teams: TEAMS.length, eraMeta, nationResults },
  };
}
