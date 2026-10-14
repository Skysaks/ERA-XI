import { enText, msg, type Msg } from "@/i18n";
import type { Formation, FormationSlot, Impact, Line, PlayerEra, Role, TacticalDimension, TacticalProfile, TeamRatings } from "@/types";
import { POSITION_LINE, WIDE_POSITIONS } from "./positions";
import { effective, lineupEntries, type LineupEntry } from "./ratings";
import { ENGINE_VERSION } from "./version";

export const DIMENSIONS: TacticalDimension[] = [
  "width",
  "finishing",
  "creation",
  "progression",
  "retention",
  "coverage",
  "ballWinning",
  "pace",
  "aerial",
  "buildUp",
];

/** Threshold below which a dimension starts to hurt, and how much. */
export const DIM_RULES: Record<TacticalDimension, { threshold: number; weight: number }> = {
  width: { threshold: 76, weight: 0.7 },
  finishing: { threshold: 84, weight: 0.8 },
  creation: { threshold: 84, weight: 0.8 },
  progression: { threshold: 76, weight: 0.5 },
  retention: { threshold: 78, weight: 0.5 },
  coverage: { threshold: 80, weight: 0.8 },
  ballWinning: { threshold: 76, weight: 0.7 },
  pace: { threshold: 74, weight: 0.4 },
  aerial: { threshold: 72, weight: 0.4 },
  buildUp: { threshold: 74, weight: 0.4 },
};

export const DIM_LABEL: Record<TacticalDimension, string> = {
  width: "WIDTH",
  finishing: "FINISHING",
  creation: "CREATION",
  progression: "PROGRESSION",
  retention: "CONTROL",
  coverage: "DEFENCE",
  ballWinning: "BALL WINNING",
  pace: "PACE",
  aerial: "AERIAL",
  buildUp: "BUILD-UP",
};

const STRENGTH_TEXT: Record<TacticalDimension, string> = {
  width: "Elite width",
  finishing: "Ruthless finishing",
  creation: "Elite creation",
  progression: "Relentless ball progression",
  retention: "Total control of the ball",
  coverage: "Excellent defensive coverage",
  ballWinning: "Wins every midfield duel",
  pace: "Frightening pace",
  aerial: "Dominant in the air",
  buildUp: "Calm, clean build-up",
};


/** Per-player cost of unfamiliarity on FIT. */
const OOP_FIT_COST = 30;
const OVERLAP_FIT_COST = 3;

type Mode = "contributors" | "zeroFill";
type Dims = Record<TacticalDimension, number | null>;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * contributors: average over filled slots only (live FIT, final ratings).
 * zeroFill: empty slots count as zero — every pick moves something up; used for impact feedback.
 */
function avgOver(values: number[], expected: number, mode: Mode): number | null {
  if (mode === "zeroFill") return expected > 0 ? values.reduce((a, b) => a + b, 0) / expected : null;
  return values.length ? mean(values) : null;
}

function topWeighted(values: number[], weights: number[], mode: Mode): number | null {
  const sorted = values.slice().sort((a, b) => b - a);
  if (mode === "contributors" && sorted.length === 0) return null;
  let total = 0;
  let wsum = 0;
  weights.forEach((w, i) => {
    const v = sorted[i];
    if (v === undefined) {
      if (mode === "zeroFill") wsum += w;
      return;
    }
    total += v * w;
    wsum += w;
  });
  return wsum ? total / wsum : null;
}

function combine(parts: [number | null, number][]): number | null {
  const present = parts.filter((p): p is [number, number] => p[0] !== null);
  if (!present.length) return null;
  const w = present.reduce((a, [, x]) => a + x, 0);
  return present.reduce((a, [v, x]) => a + v * x, 0) / w;
}

function lineOfEntry(e: LineupEntry): Line {
  return POSITION_LINE[e.slot.position];
}

function computeDims(entries: LineupEntry[], formation: Formation, mode: Mode): Dims {
  const slotsWhere = (pred: (p: FormationSlot) => boolean) => formation.slots.filter((s) => pred(s)).length;
  const outfield = entries.filter((e) => e.slot.position !== "GK");
  const isWide = (e: LineupEntry) => WIDE_POSITIONS.has(e.slot.position);
  const isFullBack = (p: string) => p === "LB" || p === "RB" || p === "LWB" || p === "RWB";

  const nWide = slotsWhere((s) => WIDE_POSITIONS.has(s.position));
  const widthBase = avgOver(
    entries.filter(isWide).map((e) => effective(e, "pace") * 0.35 + effective(e, "progression") * 0.35 + effective(e, "creation") * 0.3),
    nWide,
    mode,
  );
  const width = widthBase === null ? null : widthBase * (0.85 + 0.0375 * Math.min(nWide, 4));

  const finishing = topWeighted(outfield.map((e) => effective(e, "finishing")), [0.5, 0.3, 0.2], mode);
  const creation = topWeighted(outfield.map((e) => effective(e, "creation")), [0.45, 0.35, 0.2], mode);

  const progPred = (e: LineupEntry) => lineOfEntry(e) === "MID" || isFullBack(e.slot.position);
  const progression = avgOver(
    entries.filter(progPred).map((e) => effective(e, "progression")),
    slotsWhere((s) => POSITION_LINE[s.position] === "MID" || isFullBack(s.position)),
    mode,
  );

  const retPred = (l: Line) => l === "MID" || l === "ATT";
  const retention = avgOver(
    entries.filter((e) => retPred(lineOfEntry(e))).map((e) => effective(e, "retention")),
    slotsWhere((s) => retPred(POSITION_LINE[s.position])),
    mode,
  );

  const def = entries.filter((e) => lineOfEntry(e) === "DEF");
  const mid = entries.filter((e) => lineOfEntry(e) === "MID");
  const att = entries.filter((e) => lineOfEntry(e) === "ATT");
  const nDef = slotsWhere((s) => POSITION_LINE[s.position] === "DEF");
  const nMid = slotsWhere((s) => POSITION_LINE[s.position] === "MID");
  const nAtt = slotsWhere((s) => POSITION_LINE[s.position] === "ATT");

  const coverage = combine([
    [avgOver(def.map((e) => effective(e, "defence")), nDef, mode), 0.7],
    [avgOver(mid.map((e) => effective(e, "defence")), nMid, mode), 0.3],
  ]);

  const ballWinning = topWeighted(
    mid.map((e) => effective(e, "pressing") * 0.5 + effective(e, "defence") * 0.5),
    [0.6, 0.4],
    mode,
  );

  const pace = avgOver(
    [...def, ...att].map((e) => effective(e, "pace")),
    nDef + nAtt,
    mode,
  );

  const cbs = entries.filter((e) => e.slot.position === "CB");
  const aerial = combine([
    [avgOver(cbs.map((e) => effective(e, "aerial")), slotsWhere((s) => s.position === "CB"), mode), 0.6],
    [topWeighted(att.map((e) => effective(e, "aerial")), [1], mode), 0.4],
  ]);

  const gk = entries.filter((e) => e.slot.position === "GK");
  const builders = entries.filter((e) => e.slot.position === "CB" || e.slot.position === "DM");
  const buildUp = combine([
    [avgOver(builders.map((e) => effective(e, "buildUp")), slotsWhere((s) => s.position === "CB" || s.position === "DM"), mode), 0.8],
    [avgOver(gk.map((e) => effective(e, "distribution")), 1, mode), 0.2],
  ]);

  return { width, finishing, creation, progression, retention, coverage, ballWinning, pace, aerial, buildUp };
}

/** Same role stacked in one line (midfield or attack) → overlap. */
export function roleOverlap(entries: LineupEntry[]): number {
  let overlap = 0;
  for (const line of ["MID", "ATT"] as Line[]) {
    const counts = new Map<Role, number>();
    for (const e of entries) {
      if (lineOfEntry(e) !== line) continue;
      const r = e.player.roles[0];
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    for (const c of counts.values()) if (c > 1) overlap += c - 1;
  }
  return overlap;
}

// ── FIT v2 (engine v4): role relationships ─────────────────────────────────────
/**
 * Explainable role interactions. Each rule reads roles, slots and a couple of attributes,
 * and produces a named ± FIT adjustment with the players involved — no hidden chemistry.
 */
export interface FitNote {
  id: string;
  /** FIT points added (+) or removed (−). */
  delta: number;
  /** i18n key: synergy.<id> */
  key: string;
  /** Short names of the players the rule is about (for the explanation line). */
  players: string[];
}

const role = (e: LineupEntry) => e.player.roles[0];
const isRole = (e: LineupEntry, ...rs: Role[]) => rs.includes(role(e) as Role);
const flankOf = (e: LineupEntry): "L" | "R" | "C" => (e.slot.x < 35 ? "L" : e.slot.x > 65 ? "R" : "C");
const FULLBACK_SLOTS = new Set(["LB", "RB", "LWB", "RWB"]);
const WIDE_ATTACK_SLOTS = new Set(["LW", "RW", "LM", "RM"]);
const SYNERGY_MIN = -10;
const SYNERGY_MAX = 6;

export function roleSynergies(entries: LineupEntry[], formation: Formation): FitNote[] {
  const notes: FitNote[] = [];
  const add = (id: string, delta: number, who: LineupEntry[]) => notes.push({ id, delta, key: `synergy.${id}`, players: who.map((e) => e.player.shortName) });
  const inLine = (l: Line) => entries.filter((e) => lineOfEntry(e) === l);
  const mids = inLine("MID");
  const strikers = entries.filter((e) => e.slot.position === "ST");
  const cbs = entries.filter((e) => e.slot.position === "CB");
  const fullBacks = entries.filter((e) => FULLBACK_SLOTS.has(e.slot.position));
  const wideAttackers = entries.filter((e) => WIDE_ATTACK_SLOTS.has(e.slot.position));
  const complete = entries.length === formation.slots.length;

  // 1. Width: a flank whose wide attacker cuts inside and whose full-back does not overlap.
  for (const side of ["L", "R"] as const) {
    const w = wideAttackers.find((e) => flankOf(e) === side);
    const fb = fullBacks.find((e) => flankOf(e) === side);
    if (!w || !fb) continue;
    if (!isRole(w, "WNG", "WB", "FB") && !isRole(fb, "FB", "WB")) add(side === "L" ? "narrowLeft" : "narrowRight", -3, [w, fb]);
  }
  // Formations without wingers live on their full-backs.
  if (complete && wideAttackers.length === 0 && fullBacks.length >= 2 && fullBacks.every((e) => !isRole(e, "FB", "WB"))) add("narrow", -3, fullBacks);

  // 2. Transition: several creators, nobody screening.
  const creators = entries.filter((e) => (lineOfEntry(e) === "MID" || e.slot.position === "AM") && isRole(e, "PM", "F9", "IF", "WNG"));
  const screens = mids.filter((e) => isRole(e, "ANC", "BW"));
  if (creators.length >= 2 && screens.length === 0 && mids.length >= 3) add("transition", -4, creators);

  // 3. Aerial striker fed by real crossers.
  const target = strikers.find((e) => isRole(e, "TM") || e.player.aerial >= 88);
  const crossers = entries.filter((e) => WIDE_POSITIONS.has(e.slot.position) && isRole(e, "WNG", "FB", "WB") && e.player.creation >= 78);
  if (target && crossers.length >= 2) add("crosses", 3, [target, ...crossers.slice(0, 2)]);

  // 4. Slow centre-backs behind a high, aggressive team.
  const aggressive = fullBacks.filter((e) => isRole(e, "FB", "WB")).length >= 2 || strikers.some((e) => isRole(e, "PRS"));
  const slowCbs = cbs.filter((e) => e.player.pace < 70);
  if (aggressive && slowCbs.length >= 2 && !entries.some((e) => isRole(e, "SK"))) add("slowLine", -3, slowCbs);

  // 5. Build-up: a ball-playing centre-back finding an elite deep progressor.
  const bpd = cbs.find((e) => isRole(e, "BPD") || e.player.buildUp >= 86);
  const deep = mids.find((e) => isRole(e, "DLP", "PM") && e.player.progression >= 86);
  if (bpd && deep) add("buildUp", entries.some((e) => isRole(e, "SK")) ? 4 : 3, [bpd, deep]);

  // 6. Strike partnerships (two-striker shapes).
  if (strikers.length >= 2) {
    const [a, b] = strikers as [LineupEntry, LineupEntry];
    const big = (e: LineupEntry) => isRole(e, "TM", "CF");
    const small = (e: LineupEntry) => isRole(e, "PCH", "F9", "IF", "PRS");
    if ((big(a) && small(b)) || (big(b) && small(a))) add("partnership", 2, [a, b]);
    else if ((isRole(a, "TM") && isRole(b, "TM")) || (isRole(a, "PCH") && isRole(b, "PCH"))) add("sameSpace", -2, [a, b]);
  }

  // 7. False nine + inside forwards running beyond him.
  const f9 = strikers.find((e) => isRole(e, "F9"));
  const runners = wideAttackers.filter((e) => isRole(e, "IF"));
  if (f9 && runners.length >= 1) add("falseNine", 2, [f9, ...runners]);

  // 8. Nobody to win the ball back in midfield.
  if (complete && mids.length >= 2 && !mids.some((e) => isRole(e, "BW", "ANC", "B2B"))) add("noBallWinner", -3, mids.slice(0, 3));

  // Bound the total so relationships refine the XI rather than decide it.
  const total = notes.reduce((a, n) => a + n.delta, 0);
  const clamped = Math.max(SYNERGY_MIN, Math.min(SYNERGY_MAX, total));
  if (clamped !== total && notes.length) {
    const scale = clamped / total;
    for (const n of notes) n.delta = Math.round(n.delta * scale * 10) / 10;
  }
  return notes;
}

export interface FitBreakdown {
  fit: number;
  dims: Dims;
  outOfPosition: number;
  overlap: number;
  /** Engine v4+: role relationships behind the FIT number. */
  synergies: FitNote[];
}

/** Engine versions with FIT v2 (role relationships). */
export const fitV2 = (engineVersion: string) => Number(engineVersion) >= 4;

export function computeFit(entries: LineupEntry[], formation: Formation, engineVersion: string = ENGINE_VERSION): FitBreakdown {
  const dims = computeDims(entries, formation, "contributors");
  let penalty = 0;
  for (const d of DIMENSIONS) {
    const v = dims[d];
    if (v === null) continue;
    const { threshold, weight } = DIM_RULES[d];
    penalty += Math.max(0, threshold - v) * weight;
  }
  let oop = 0;
  for (const e of entries) {
    penalty += (1 - e.assessment.familiarity) * OOP_FIT_COST;
    if (e.assessment.outOfPosition) oop++;
  }
  const overlap = roleOverlap(entries);
  penalty += overlap * OVERLAP_FIT_COST;
  const synergies = fitV2(engineVersion) ? roleSynergies(entries, formation) : [];
  const bonus = synergies.reduce((a, n) => a + n.delta, 0);
  return { fit: Math.round(Math.max(30, Math.min(100, 100 - penalty + bonus))), dims, outOfPosition: oop, overlap, synergies };
}

export interface FitItem {
  kind: "dimension" | "position" | "overlap" | "synergy";
  /** i18n key of the label. */
  key: string;
  params?: Record<string, string | number>;
  delta: number;
}

/**
 * FIT, itemised: every point lost or gained with its reason. The items add up to the FIT
 * (before the 30–100 clamp, rounded), so nothing about the number is hidden.
 */
export function explainFit(lineup: readonly (PlayerEra | null)[], formation: Formation, engineVersion: string = ENGINE_VERSION): { fit: number; items: FitItem[] } {
  const entries = lineupEntries(lineup, formation);
  const b = computeFit(entries, formation, engineVersion);
  const items: FitItem[] = [];
  for (const d of DIMENSIONS) {
    const v = b.dims[d];
    if (v === null) continue;
    const { threshold, weight } = DIM_RULES[d];
    const loss = Math.max(0, threshold - v) * weight;
    if (loss >= 0.5) items.push({ kind: "dimension", key: "fitx.dim", params: { dim: `@dim.${d}`, v: Math.round(v), t: threshold }, delta: -loss });
  }
  for (const e of entries) {
    const loss = (1 - e.assessment.familiarity) * OOP_FIT_COST;
    if (loss >= 0.5) items.push({ kind: "position", key: "fitx.pos", params: { name: e.player.shortName, slot: `@pos.${e.slot.position}` }, delta: -loss });
  }
  if (b.overlap > 0) items.push({ kind: "overlap", key: "fitx.overlap", params: { n: b.overlap }, delta: -b.overlap * OVERLAP_FIT_COST });
  for (const n of b.synergies) items.push({ kind: "synergy", key: n.key, params: { names: n.players.join(", ") }, delta: n.delta });
  items.sort((a, c) => a.delta - c.delta);
  const raw = 100 + items.reduce((a, it) => a + it.delta, 0);
  if (raw < 30) items.push({ kind: "dimension", key: "fitx.floor", delta: 30 - raw });
  if (raw > 100) items.push({ kind: "dimension", key: "fitx.cap", delta: 100 - raw });
  return { fit: b.fit, items };
}

function lineAvg(entries: LineupEntry[], line: Line): number {
  const xs = entries.filter((e) => lineOfEntry(e) === line).map((e) => e.assessment.rating);
  return xs.length ? mean(xs) : 0;
}

export function rateLineup(lineup: readonly (PlayerEra | null)[], formation: Formation, engineVersion: string = ENGINE_VERSION): TeamRatings {
  const entries = lineupEntries(lineup, formation);
  const { fit, dims, outOfPosition, overlap, synergies } = computeFit(entries, formation, engineVersion);
  const profile = {} as TacticalProfile;
  for (const d of DIMENSIONS) profile[d] = Math.round(dims[d] ?? 0);
  return {
    att: Math.round(lineAvg(entries, "ATT")),
    mid: Math.round(lineAvg(entries, "MID")),
    def: Math.round(lineAvg(entries, "DEF")),
    gk: Math.round(lineAvg(entries, "GK")),
    overall: Math.round(entries.length ? mean(entries.map((e) => e.assessment.rating)) : 0),
    fit,
    dims: profile,
    outOfPosition,
    overlap,
    ...(synergies.length ? { synergies: synergies.map((n) => ({ id: n.id, delta: n.delta, players: n.players })) } : {}),
  };
}

/**
 * Short feedback after a pick. Compares zero-filled profiles so the message
 * reflects what the new player actually added, plus any structural cost.
 */
export function pickImpacts(
  before: readonly (PlayerEra | null)[],
  after: readonly (PlayerEra | null)[],
  newSlotIndex: number,
  formation: Formation,
  engineVersion: string = ENGINE_VERSION,
): Impact[] {
  const eBefore = lineupEntries(before, formation);
  const eAfter = lineupEntries(after, formation);
  const out: Impact[] = [];

  const placed = eAfter.find((e) => e.index === newSlotIndex);
  if (placed?.assessment.outOfPosition) out.push({ label: "OUT OF POSITION", tone: "down", key: "impact.oop" });
  if (roleOverlap(eAfter) > roleOverlap(eBefore)) out.push({ label: "ROLE OVERLAP", tone: "down", key: "impact.overlap" });
  // FIT v2: a role relationship this pick created (e.g. CROSSES FOR THE TARGET MAN ↑).
  if (fitV2(engineVersion)) {
    const had = new Set(roleSynergies(eBefore, formation).map((n) => n.id));
    const fresh = roleSynergies(eAfter, formation).filter((n) => !had.has(n.id) && placed && n.players.includes(placed.player.shortName));
    const up = fresh.find((n) => n.delta > 0);
    const down = fresh.find((n) => n.delta < 0);
    if (up) out.unshift({ label: up.id, tone: "up", key: `synergy.${up.id}.short` });
    if (down) out.push({ label: down.id, tone: "down", key: `synergy.${down.id}.short` });
  }

  if (placed?.slot.position === "GK") {
    out.unshift({ label: "SHOT-STOPPING", tone: "up", key: "impact.shot" });
    return out.slice(0, 2);
  }

  const dB = computeDims(eBefore, formation, "zeroFill");
  const dA = computeDims(eAfter, formation, "zeroFill");
  const gains = DIMENSIONS.map((d) => ({
    d,
    g: ((dA[d] ?? 0) - (dB[d] ?? 0)) / DIM_RULES[d].threshold,
  })).sort((a, b) => b.g - a.g);

  const ups: Impact[] = [];
  const first = gains[0];
  if (first && first.g > 0.02) ups.push({ label: DIM_LABEL[first.d], tone: "up", key: `dimShort.${first.d}` });
  const second = gains[1];
  if (first && second && out.length === 0 && second.g > 0.06 && second.g >= first.g * 0.75) {
    ups.push({ label: DIM_LABEL[second.d], tone: "up", key: `dimShort.${second.d}` });
  }
  return [...ups, ...out].slice(0, 2);
}

/** 2–3 concise observations for the complete XI. */
export const NO_KEEPER_TEXT = "No real goalkeeper";

export interface Observation {
  msg: Msg;
  good: boolean;
}

/** Same logic as `observations`, as translatable messages. */
export function observationMsgs(ratings: TeamRatings, hasKeeper = true): Observation[] {
  const dims = DIMENSIONS.map((d) => ({ d, v: ratings.dims[d], gap: DIM_RULES[d].threshold - ratings.dims[d] }));
  const strengths = dims.filter((x) => x.v >= 88).sort((a, b) => b.v - a.v);
  const weaknesses = dims.filter((x) => x.gap > 0).sort((a, b) => b.gap * DIM_RULES[b.d].weight - a.gap * DIM_RULES[a.d].weight);
  const out: Observation[] = [];
  if (!hasKeeper) out.push({ msg: msg("obs.noKeeper"), good: false });
  const s0 = strengths[0];
  if (s0) out.push({ msg: msg(`obs.strength.${s0.d}`), good: true });
  const w0 = weaknesses[0];
  if (w0) out.push({ msg: msg(`obs.weakness.${w0.d}`), good: false });
  if (ratings.outOfPosition > 0) out.push({ msg: msg("obs.oop", { n: ratings.outOfPosition }), good: false });
  else if (ratings.overlap >= 2) out.push({ msg: msg("obs.overlap"), good: false });
  const s1 = strengths[1];
  if (out.length < 3 && s1) out.push({ msg: msg(`obs.strength.${s1.d}`), good: true });
  const w1 = weaknesses[1];
  if (out.length < 3 && w1) out.push({ msg: msg(`obs.weakness.${w1.d}`), good: false });
  if (out.length === 0) out.push({ msg: msg("obs.balanced"), good: true });
  return out.slice(0, 3);
}

export function observations(ratings: TeamRatings, hasKeeper = true): string[] {
  return observationMsgs(ratings, hasKeeper).map((o) => enText(o.msg));
}

export function isStrengthText(text: string): boolean {
  return Object.values(STRENGTH_TEXT).includes(text) || text === "Balanced across every line";
}
