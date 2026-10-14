import type { ClubEra, EraBucket, Player, PlayerEra, Position, Role, Team } from "@/types";
import { ARCHETYPES, buildAttributes, derivedOverall, parseOverrides } from "./archetypes";
import { ERA_FILES } from "./eras";
import { europeanCupsOf } from "./champions";
import { TEAMS } from "./teams";

/**
 * Dataset registry.
 *
 * Built for thousands of PlayerEras: era metadata and ids are indexed eagerly (string
 * splitting only), while full PlayerEra objects (attributes, derived rating) are parsed
 * lazily per era on first access and cached. Draft generation only touches the ~12 eras
 * it draws, so start-up cost stays flat as the dataset grows.
 */

const POSITIONS: ReadonlySet<string> = new Set([
  "GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST",
]);

const SHORT_NAMES: Record<string, string> = {
  "Víctor Valdés": "Valdés",
  "Van Bronckhorst": "Bronckhorst",
  "Míchel Salgado": "Salgado",
  "Roberto Carlos": "R. Carlos",
  "Keylor Navas": "Navas",
  "Cristiano Ronaldo": "Cristiano",
  "Vinícius Jr": "Vinícius",
  "Ferland Mendy": "F. Mendy",
  "Park Ji-sung": "Park",
  "Bernardo Silva": "Bernardo",
  "Alexander-Arnold": "Trent",
  "Gilberto Silva": "Gilberto",
  "Sebastiano Rossi": "S. Rossi",
  "Thiago Silva": "T. Silva",
  "Frenkie de Jong": "F. de Jong",
  "Ronald de Boer": "R. de Boer",
  "Frank de Boer": "F. de Boer",
  "Lamine Yamal": "Yamal",
  "Gabriel Jesus": "G. Jesus",
  "Roberto Baggio": "R. Baggio",
  "Dino Baggio": "D. Baggio",
  "Di Stéfano": "Di Stéfano",
  "Bobby Charlton": "Charlton",
  "Luisito Suárez": "L. Suárez",
  "Sandro Mazzola": "Mazzola",
  "Cesare Maldini": "C. Maldini",
  "Gerd Müller": "G. Müller",
  "Uli Hoeneß": "U. Hoeneß",
  "Dieter Hoeneß": "D. Hoeneß",
  "Jimmy Johnstone": "Johnstone",
  "Pieters Graafland": "Graafland",
  "Gerrie Mühren": "G. Mühren",
  "John Robertson": "J. Robertson",
  "Trevor Francis": "Francis",
  "Trevor Steven": "T. Steven",
  "Paolo Rossi": "P. Rossi",
  "Hugo Sánchez": "Hugo Sánchez",
  "Martín Vázquez": "M. Vázquez",
  "Jaime Magalhães": "Magalhães",
  "António Sousa": "A. Sousa",
  "Eduardo Luís": "E. Luís",
  "Mahamadou Diarra": "M. Diarra",
  "Francisco Molina": "Molina",
  "Enrico Chiesa": "Chiesa",
  "Roberto Mancini": "Mancini",
  "Sérgio Conceição": "Conceição",
  "Kasper Schmeichel": "K. Schmeichel",
  "Benjamin Mendy": "B. Mendy",
  "Édouard Mendy": "É. Mendy",
  "Mousa Dembélé": "M. Dembélé",
  "Emiliano Martínez": "E. Martínez",
  "Nahuel Molina": "N. Molina",
  "Enzo Fernández": "Enzo",
  "Julián Álvarez": "J. Álvarez",
  "Carlos Alberto": "C. Alberto",
  "José Luis Brown": "Brown",
  "Gonçalo Ramos": "G. Ramos",
  "Kim Min-jae": "Kim",
  "Marcos Alonso": "M. Alonso",
  "José María Vidal": "Vidal",
  "Costa Pereira": "C. Pereira",
};

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function shortNameOf(name: string): string {
  const explicit = SHORT_NAMES[name];
  if (explicit) return explicit;
  if (name.length <= 11) return name;
  const parts = name.split(" ");
  return parts[parts.length - 1] ?? name;
}

export function bucketOf(start: number, end: number): EraBucket {
  const mid = Math.floor((start + end) / 2);
  if (mid < 1980) return "pre1980";
  if (mid < 1990) return "1980s";
  if (mid < 2000) return "1990s";
  if (mid < 2010) return "2000s";
  if (mid < 2020) return "2010s";
  return "2020s";
}

export const BUCKET_LABEL: Record<EraBucket, string> = {
  pre1980: "1950s–70s",
  "1980s": "1980s",
  "1990s": "1990s",
  "2000s": "2000s",
  "2010s": "2010s",
  "2020s": "2020s",
};

interface RowHead {
  name: string;
  playerId: string;
  row: string;
}

function rowHead(row: string): RowHead {
  const parts = row.split("|");
  const name = parts[0];
  if (!name) throw new Error(`Bad row: ${row}`);
  return { name, playerId: parts[5] || slugify(name), row };
}

function parseRow(head: RowHead, clubId: string, clubEraId: string, era: string): PlayerEra {
  const [, posStr, lvlStr, roleStr, overrides] = head.row.split("|");
  if (!posStr || !lvlStr || !roleStr) throw new Error(`Bad row: ${head.row}`);
  const positions = posStr.split(" ");
  for (const p of positions) if (!POSITIONS.has(p)) throw new Error(`Bad position ${p} in ${head.row}`);
  if (!(roleStr in ARCHETYPES)) throw new Error(`Bad role ${roleStr} in ${head.row}`);
  const level = Number(lvlStr);
  if (!Number.isInteger(level) || level < 50 || level > 99) throw new Error(`Bad level in ${head.row}`);
  const role = roleStr as Role;
  const attrs = buildAttributes(level, role, parseOverrides(overrides));
  const natural = positions[0] as Position;
  return {
    id: `${clubEraId}:${head.playerId}`,
    playerId: head.playerId,
    name: head.name,
    shortName: shortNameOf(head.name),
    clubId,
    clubEraId,
    era,
    positions: positions as Position[],
    level,
    overall: derivedOverall(level, role, attrs, natural),
    roles: [role],
    ...attrs,
  };
}

// ── eager index (cheap) ──
const teams = new Map<string, Team>(TEAMS.map((t) => [t.id, t]));
const clubEras = new Map<string, ClubEra>();
const eraRows = new Map<string, RowHead[]>();
const playerEraToEra = new Map<string, string>();
const players = new Map<string, Player>();
/** playerId → every PlayerEra id of that identity (precomputed; O(1) lookups). */
const versionsOf = new Map<string, string[]>();

/**
 * Dataset versions: engine v2 drew from the V1 files only; the V1.3 expansion ("more-*")
 * arrives with engine v3. Old challenge links (v2) keep replaying on exactly their pool.
 */
const RAW_FILE = new Map(Object.entries(ERA_FILES).flatMap(([file, eras]) => eras.map((raw) => [raw, file] as const)));
const RAW_WITH_SINCE = Object.entries(ERA_FILES).flatMap(([file, eras]) => eras.map((raw) => ({ raw, since: file.startsWith("v2-") ? 7 : file.startsWith("world-") ? 6 : file.startsWith("more-") || file === "nations" ? 3 : 2 })));

const RAW_ERAS_BY_ID = new Map<string, (typeof RAW_WITH_SINCE)[number]["raw"]>(RAW_WITH_SINCE.map(({ raw }) => [`${raw.team}-${raw.start}`, raw]));
for (const { raw, since } of RAW_WITH_SINCE) {
  const team = teams.get(raw.team);
  if (!team) throw new Error(`Unknown team ${raw.team}`);
  const id = `${raw.team}-${raw.start}`;
  if (clubEras.has(id)) throw new Error(`Duplicate era ${id}`);
  const heads = raw.players.map(rowHead);
  const ids = heads.map((h) => `${id}:${h.playerId}`);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate player in ${id}`);
  for (const [i, h] of heads.entries()) {
    playerEraToEra.set(ids[i]!, id);
    if (!players.has(h.playerId)) players.set(h.playerId, { id: h.playerId, name: h.name });
    const list = versionsOf.get(h.playerId);
    if (list) list.push(ids[i]!);
    else versionsOf.set(h.playerId, [ids[i]!]);
  }
  eraRows.set(id, heads);
  clubEras.set(id, {
    id,
    clubId: raw.team,
    kind: team.kind,
    label: raw.label,
    startYear: raw.start,
    endYear: raw.end,
    bucket: bucketOf(raw.start, raw.end),
    playerEraIds: ids,
    since,
    provenance: RAW_FILE.get(raw) === undefined || RAW_FILE.get(raw)!.startsWith("more-") || RAW_FILE.get(raw)!.startsWith("world-") || RAW_FILE.get(raw)!.startsWith("v2-") ? "expansion" : "core",
    europeanCups: team.kind === "club" ? [...new Set([...(raw.euro ?? []), ...europeanCupsOf(raw.team, raw.start, raw.end)])].sort() : [],
  });
}

// ── lazy PlayerEra materialisation ──
const parsed = new Map<string, PlayerEra>();

function materialiseEra(eraId: string) {
  const era = clubEras.get(eraId);
  const heads = eraRows.get(eraId);
  if (!era || !heads) throw new Error(`Unknown era ${eraId}`);
  for (const h of heads) {
    const pe = parseRow(h, era.clubId, era.id, era.label);
    parsed.set(pe.id, pe);
  }
}

export const ALL_CLUB_ERAS: readonly ClubEra[] = [...clubEras.values()];

export function getClub(id: string): Team {
  const c = teams.get(id);
  if (!c) throw new Error(`Unknown team ${id}`);
  return c;
}
export const getTeam = getClub;

export function getClubEra(id: string): ClubEra {
  const c = clubEras.get(id);
  if (!c) throw new Error(`Unknown era ${id}`);
  return c;
}

export function getPlayerEra(id: string): PlayerEra {
  let p = parsed.get(id);
  if (!p) {
    const eraId = playerEraToEra.get(id);
    if (!eraId) throw new Error(`Unknown player ${id}`);
    materialiseEra(eraId);
    p = parsed.get(id);
    if (!p) throw new Error(`Unknown player ${id}`);
  }
  return p;
}

export function hasClubEra(id: string): boolean {
  return clubEras.has(id);
}

export function hasPlayerEra(id: string): boolean {
  return playerEraToEra.has(id);
}

/** Every PlayerEra id of one player across eras (e.g. Messi 2008–12, 2014–18, 2018–21…), oldest first. */
export function playerEraIdsOf(playerId: string): string[] {
  const ids = versionsOf.get(playerId);
  if (!ids) return [];
  return ids.slice().sort((a, b) => getClubEra(playerEraToEra.get(a)!).startYear - getClubEra(playerEraToEra.get(b)!).startYear);
}

export function getPlayer(playerId: string): Player | null {
  return players.get(playerId) ?? null;
}

export const ALL_PLAYER_IDS: readonly string[] = [...players.keys()];

// ── nationality: its own chunk (~31 KB), loaded when idle; nothing in the draft needs it ──
export type Confidence = "high" | "medium" | "low";
let nationality: Map<string, { codes: string[]; confidence: Confidence }> | null = null;
let nationalityRaw: string | null = null;
let nationalityLoading: Promise<void> | null = null;

/** Load the nationality table (idempotent). Until it resolves, nationOf() answers null. */
export function loadNationality(): Promise<void> {
  nationalityLoading ??= import("./nationality").then((m) => {
    nationalityRaw = m.NATIONALITY_RAW;
    nationality = null;
  });
  return nationalityLoading;
}

function nationalityIndex() {
  if (nationality) return nationality;
  if (nationalityRaw === null) return new Map<string, { codes: string[]; confidence: Confidence }>();
  nationality = new Map();
  for (const entry of nationalityRaw.split(";")) {
    const eq = entry.indexOf("=");
    if (eq < 0) continue;
    let v = entry.slice(eq + 1);
    let confidence: Confidence = "high";
    if (v.endsWith("~")) {
      confidence = "medium";
      v = v.slice(0, -1);
    } else if (v.endsWith("?")) {
      confidence = "low";
      v = v.slice(0, -1);
    }
    nationality.set(entry.slice(0, eq), { codes: v.split("/"), confidence });
  }
  return nationality;
}

/** Distinct nationalities in the dataset (high/medium confidence). */
export function allNationalities(): string[] {
  const out = new Set<string>();
  for (const v of nationalityIndex().values()) if (v.confidence !== "low" && v.codes[0]) out.add(v.codes[0]);
  return [...out].sort();
}

/** The national team a player represented (first code); null when unknown. Low-confidence entries are flagged, never shown as fact. */
export function nationOf(playerId: string): { code: string; codes: string[]; confidence: Confidence } | null {
  const n = nationalityIndex().get(playerId);
  return n && n.codes[0] ? { code: n.codes[0], codes: n.codes, confidence: n.confidence } : null;
}

// ── rating metadata (internal) ──
/** ERA XI's own rating model: era level + role archetype + per-player overrides → attributes → overall. */
export const RATING_VERSION = "r1";

export interface PlayerEraMeta {
  ratingVersion: string;
  /** Editorial confidence in the authored level (not shown publicly). */
  ratingConfidence: Confidence;
  /** Structured rationale: authored era level, role archetype, explicit attribute adjustments. */
  ratingRationale: { level: number; role: string; adjustments: string[]; derivedOverall: number };
  nation: string | null;
  nationConfidence: Confidence | null;
  /** Where the squad membership comes from (never shown raw in gameplay). */
  sourceMetadata: { squadFile: string; squadCheck: "online" | "editorial" };
}

export function getPlayerEraMeta(id: string): PlayerEraMeta {
  const p = getPlayerEra(id);
  const era = getClubEra(p.clubEraId);
  const head = eraRows.get(era.id)!.find((h) => `${era.id}:${h.playerId}` === id)!;
  const overrides = (head.row.split("|")[4] ?? "").trim();
  const n = nationOf(p.playerId);
  // Core files were reviewed twice; expansion eras before 1980 are the least verified.
  const ratingConfidence: Confidence = era.provenance === "core" ? "high" : era.startYear < 1980 ? "low" : "medium";
  return {
    ratingVersion: RATING_VERSION,
    ratingConfidence,
    ratingRationale: { level: p.level, role: p.roles[0] ?? "", adjustments: overrides ? overrides.split(/\s+/) : [], derivedOverall: p.overall },
    nation: n?.code ?? null,
    nationConfidence: n?.confidence ?? null,
    sourceMetadata: {
      squadFile: eraFile(era.id),
      // V1.8 world files: every squad member checked against published squad lists when authored.
      squadCheck: eraFile(era.id).startsWith("world-") ? "online" : "editorial",
    },
  };
}

function eraFile(eraId: string): string {
  const raw = RAW_ERAS_BY_ID.get(eraId);
  return (raw && RAW_FILE.get(raw)) ?? "unknown";
}

export function playerIdOf(playerEraId: string): string {
  return playerEraId.slice(playerEraId.indexOf(":") + 1);
}

/** Eras available to an engine version's draws. */
export function erasForEngine(engineVersion: string): readonly ClubEra[] {
  const v = Number(engineVersion);
  return ALL_CLUB_ERAS.filter((e) => e.since <= v);
}

export const DATA_STATS = {
  nations: TEAMS.filter((t) => t.kind === "nation").length,
  teams: teams.size,
  clubs: TEAMS.filter((t) => t.kind === "club").length,
  eras: clubEras.size,
  playerEras: playerEraToEra.size,
  players: players.size,
};

export { BUCKET_LABEL as ERA_BUCKET_LABEL };
