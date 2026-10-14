/**
 * PLAYERERA PROFILE & ROLE SCHOOL — everything is derived from the game model or from
 * structured facts (facts.ts). Nothing here is free-form prose about a real person.
 */
import type { AttributeKey, PlayerEra, Role } from "@/types";
import { ALL_CLUB_ERAS, getClub, getClubEra, getPlayerEra, getPlayerEraMeta, nationOf, playerEraIdsOf, type PlayerEraMeta } from "@/data";
import { positionRatings } from "@/engine";
import { SLOT_WEIGHTS } from "@/engine/weights";
import { eraFacts, playerFacts, type Fact } from "./facts";

export const OUTFIELD_ATTRS: AttributeKey[] = ["finishing", "creation", "progression", "retention", "defence", "pressing", "pace", "physical", "aerial", "buildUp"];
export const KEEPER_ATTRS: AttributeKey[] = ["goalkeeping", "distribution", "aerial", "buildUp", "pace"];

export interface RatingWhy {
  /** ≥ 90 — sorted by how much his natural position asks for it. */
  elite: AttributeKey[];
  /** 83–89 */
  strong: AttributeKey[];
  /** ≤ 62 — the model's honest limits (outfield: never goalkeeping). */
  limited: AttributeKey[];
}

/** "WHY 93?" in words: which of his attributes carry the rating, which don't. */
export function ratingWhy(p: PlayerEra): RatingWhy {
  const keeper = p.positions[0] === "GK";
  const attrs = keeper ? KEEPER_ATTRS : OUTFIELD_ATTRS;
  const w = SLOT_WEIGHTS[p.positions[0] ?? "CM"];
  const byDemand = (a: AttributeKey, b: AttributeKey) => (w[b] ?? 0) - (w[a] ?? 0) || p[b] - p[a];
  const elite = attrs.filter((a) => p[a] >= 90).sort(byDemand).slice(0, 3);
  const strong = attrs.filter((a) => p[a] >= 83 && p[a] < 90).sort(byDemand).slice(0, 3);
  const limited = attrs
    .filter((a) => p[a] <= 62)
    .sort((a, b) => p[a] - p[b])
    .slice(0, 2);
  return { elite, strong, limited };
}

export interface PlayerProfile {
  why: RatingWhy;
  role: Role;
  facts: Fact[];
  /** Other ERA XI versions of the same player, oldest first. */
  versions: { id: string; clubEraId: string; overall: number }[];
  nation: { code: string; confidence: "high" | "medium" | "low" } | null;
}

export function playerProfile(p: PlayerEra): PlayerProfile {
  const n = nationOf(p.playerId);
  return {
    why: ratingWhy(p),
    role: (p.roles[0] ?? "B2B") as Role,
    facts: [...playerFacts(p.id), ...eraFacts(p.clubEraId)],
    versions: playerEraIdsOf(p.playerId)
      .filter((id) => id !== p.id)
      .map((id) => ({ id, clubEraId: getPlayerEra(id).clubEraId, overall: getPlayerEra(id).overall })),
    nation: n ? { code: n.code, confidence: n.confidence } : null,
  };
}

/**
 * THE PLAYERERA RECORD — every field the content model promises, in one place (used by the
 * data audit and the profile). Notes are knowledge-catalog keys / structured facts, never prose.
 */
export interface PlayerEraRecord {
  id: string;
  club: string;
  nation: string | null;
  period: { start: number; end: number; label: string };
  positions: string[];
  secondaryPositions: string[];
  roles: string[];
  overall: number;
  attributes: Record<AttributeKey, number>;
  /** Knowledge key of the tactical one-liner for his role. */
  tacticalNote: string;
  /** The first structured fact (Ballon d'Or, the era's tournament or European Cup), if any. */
  historicalNote: Fact | null;
  /** Best positions by the model (natural first). */
  bestPositions: string[];
  ratingRationale: PlayerEraMeta["ratingRationale"];
  ratingVersion: string;
  ratingConfidence: PlayerEraMeta["ratingConfidence"];
  sourceMetadata: PlayerEraMeta["sourceMetadata"] & { facts: string[] };
}

const ATTRS: AttributeKey[] = ["finishing", "creation", "progression", "retention", "defence", "pressing", "pace", "physical", "aerial", "buildUp", "goalkeeping", "distribution"];

export function bestPositions(p: PlayerEra, n = 2): string[] {
  return positionRatings(p, 6)
    .filter((r, i) => i === 0 || r.rating >= p.overall - 2)
    .slice(0, n)
    .map((r) => r.position);
}

export function playerEraRecord(id: string): PlayerEraRecord {
  const p = getPlayerEra(id);
  const era = getClubEra(p.clubEraId);
  const meta = getPlayerEraMeta(id);
  const facts = [...playerFacts(p.id), ...eraFacts(p.clubEraId)];
  return {
    id,
    club: getClub(era.clubId).name,
    nation: meta.nation,
    period: { start: era.startYear, end: era.endYear, label: era.label },
    positions: [...p.positions],
    secondaryPositions: p.positions.slice(1),
    roles: [...p.roles],
    overall: p.overall,
    attributes: Object.fromEntries(ATTRS.map((a) => [a, p[a]])) as Record<AttributeKey, number>,
    tacticalNote: `role.${p.roles[0] ?? "B2B"}`,
    historicalNote: facts[0] ?? null,
    bestPositions: bestPositions(p),
    ratingRationale: meta.ratingRationale,
    ratingVersion: meta.ratingVersion,
    ratingConfidence: meta.ratingConfidence,
    sourceMetadata: { ...meta.sourceMetadata, facts: [...new Set(facts.map((f) => f.source))] },
  };
}

// ── ROLE SCHOOL ──
export interface SchoolEntry {
  /** i18n: knowledge "school.<id>.*"; role codes reuse "role.<code>" for the one-liner. */
  id: string;
  /** Closest ERA XI role tags. */
  roles: Role[];
  examples: string[];
}

const ORDER: string[] = ["regista", "DLP", "B2B", "BW", "ANC", "PM", "IF", "WNG", "F9", "TM", "PCH", "CF", "PRS", "FB", "ifb", "DFB", "WB", "BPD", "STP", "SK", "GK"];

function examplesFor(filter: (p: PlayerEra) => boolean, max = 3): string[] {
  // The best version per identity, then one per period first so examples span eras.
  const best = new Map<string, PlayerEra>();
  for (const e of ALL_CLUB_ERAS)
    for (const id of e.playerEraIds) {
      const p = getPlayerEra(id);
      if (!filter(p)) continue;
      const cur = best.get(p.playerId);
      if (!cur || p.overall > cur.overall) best.set(p.playerId, p);
    }
  const ranked = [...best.values()].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const out: PlayerEra[] = [];
  const buckets = new Set<string>();
  for (const p of ranked) {
    const b = getClubEra(p.clubEraId).bucket;
    if (buckets.has(b)) continue;
    buckets.add(b);
    out.push(p);
    if (out.length >= max) break;
  }
  return out.map((p) => p.id);
}

let school: SchoolEntry[] | null = null;
export function roleSchool(): SchoolEntry[] {
  if (school) return school;
  school = ORDER.map((id) => {
    if (id === "regista") return { id, roles: ["DLP"], examples: examplesFor((p) => p.roles[0] === "DLP" && p.positions[0] === "DM" && p.progression >= 88) };
    if (id === "ifb") return { id, roles: ["FB", "DFB"], examples: [] };
    const role = id as Role;
    return { id, roles: [role], examples: examplesFor((p) => p.roles[0] === role) };
  });
  return school;
}

/** The school entry a role belongs to (the regista card for the deepest DLPs). */
export function schoolIdFor(p: PlayerEra): string {
  const r = p.roles[0] ?? "B2B";
  if (r === "DLP" && p.positions[0] === "DM" && p.progression >= 88) return "regista";
  return r;
}
