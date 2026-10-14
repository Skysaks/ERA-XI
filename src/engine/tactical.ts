import type { Formation, Line, PlayerEra, Role, TacticalDimension } from "@/types";
import { POSITION_LINE } from "./positions";
import { effective, lineupEntries, type LineupEntry } from "./ratings";
import { DIM_RULES, DIMENSIONS, rateLineup } from "./fit";
import { ENGINE_VERSION } from "./version";

/**
 * TACTICAL READING — presentation only. Everything here READS the XI the player built (roles, slots,
 * attributes, the FIT dimensions) and names what a coach would see: completed lines, tactical
 * connections, an identity, a game plan, the structural players. It never changes a rating, a FIT
 * value or a result, so it is independent of the engine version and never needs calibration.
 * No shared-club or shared-nationality "chemistry": only roles and attributes.
 */

export type Unit = "DEF" | "MID" | "ATT";
export type Side = "L" | "R" | "C";

const sideOf = (e: LineupEntry): Side => (e.slot.x < 35 ? "L" : e.slot.x > 65 ? "R" : "C");
const lineOfEntry = (e: LineupEntry): Line => POSITION_LINE[e.slot.position];
const roleOf = (e: LineupEntry) => e.player.roles[0] as Role | undefined;
const is = (e: LineupEntry, ...rs: Role[]) => rs.includes(roleOf(e) as Role);
const WIDE_ATT = new Set(["LW", "RW", "LM", "RM"]);
const FULL_BACKS = new Set(["LB", "RB", "LWB", "RWB"]);

// ── units (lines) ──────────────────────────────────────────────────────────────
export function unitFill(lineup: readonly (PlayerEra | null)[], formation: Formation): Record<Unit, { filled: number; total: number }> {
  const out: Record<Unit, { filled: number; total: number }> = { DEF: { filled: 0, total: 0 }, MID: { filled: 0, total: 0 }, ATT: { filled: 0, total: 0 } };
  formation.slots.forEach((s, i) => {
    const line = POSITION_LINE[s.position];
    if (line === "GK") return;
    out[line].total++;
    if (lineup[i]) out[line].filled++;
  });
  return out;
}

// ── tactical connections (named role complementarity) ─────────────────────────
export interface Connection {
  id: "controlCore" | "balancedMidfield" | "overloadLeft" | "overloadRight" | "aerialSupply" | "elitePair" | "buildUpLink" | "falseNineRunners" | "strikePartnership";
  /** Slot indices of the players involved (for the pitch and the team sheet). */
  slots: number[];
  players: string[];
}

export function tacticalConnections(lineup: readonly (PlayerEra | null)[], formation: Formation): Connection[] {
  const entries = lineupEntries(lineup, formation);
  const out: Connection[] = [];
  const add = (id: Connection["id"], who: LineupEntry[]) => out.push({ id, slots: who.map((e) => e.index), players: who.map((e) => e.player.shortName) });
  const mids = entries.filter((e) => lineOfEntry(e) === "MID");
  const centralMids = mids.filter((e) => ["DM", "CM"].includes(e.slot.position));
  const strikers = entries.filter((e) => e.slot.position === "ST");
  const cbs = entries.filter((e) => e.slot.position === "CB");

  // Midfield: a screen, a controller and a runner make it balanced; screen + controller is a control core.
  const screen = mids.find((e) => is(e, "BW", "ANC"));
  const controller = centralMids.find((e) => e !== screen && (is(e, "DLP") || (is(e, "PM", "B2B") && effective(e, "retention") >= 86)));
  const runner = mids.find((e) => e !== screen && e !== controller && (is(e, "B2B") || (effective(e, "pressing") >= 82 && effective(e, "progression") >= 80)));
  if (screen && controller && runner) add("balancedMidfield", [screen, controller, runner]);
  else if (screen && controller) add("controlCore", [controller, screen]);

  // Flank overloads: a wide attacker and a full-back who overlaps, on the same side, both quick.
  for (const side of ["L", "R"] as const) {
    const w = entries.find((e) => WIDE_ATT.has(e.slot.position) && sideOf(e) === side && is(e, "IF", "WNG") && e.player.pace >= 80);
    const fb = entries.find((e) => FULL_BACKS.has(e.slot.position) && sideOf(e) === side && is(e, "FB", "WB") && e.player.pace >= 78);
    if (w && fb) add(side === "L" ? "overloadLeft" : "overloadRight", [w, fb]);
  }

  // A target in the box fed by real crossers.
  const target = strikers.find((e) => is(e, "TM") || e.player.aerial >= 88);
  const crossers = entries.filter((e) => e !== target && (WIDE_ATT.has(e.slot.position) || FULL_BACKS.has(e.slot.position)) && is(e, "WNG", "FB", "WB") && e.player.creation >= 78);
  if (target && crossers.length >= 2) add("aerialSupply", [target, ...crossers.slice(0, 2)]);

  // Two elite defenders side by side.
  const elite = cbs.filter((e) => effective(e, "defence") >= 88).sort((a, b) => b.player.defence - a.player.defence);
  if (elite.length >= 2) add("elitePair", elite.slice(0, 2));

  // Build-up: ball-playing centre-back → deep progressor.
  const bpd = cbs.find((e) => is(e, "BPD") || e.player.buildUp >= 86);
  const deep = mids.find((e) => is(e, "DLP", "PM") && e.player.progression >= 86);
  if (bpd && deep) add("buildUpLink", [bpd, deep]);

  // False nine with inside forwards running beyond him.
  const f9 = strikers.find((e) => is(e, "F9"));
  const ifs = entries.filter((e) => WIDE_ATT.has(e.slot.position) && is(e, "IF"));
  if (f9 && ifs.length) add("falseNineRunners", [f9, ...ifs.slice(0, 2)]);

  // Classic strike pair: a big forward and a quick one.
  if (strikers.length >= 2) {
    const big = strikers.find((e) => is(e, "TM", "CF"));
    const small = strikers.find((e) => e !== big && is(e, "PCH", "F9", "IF", "PRS"));
    if (big && small) add("strikePartnership", [big, small]);
  }
  return out;
}

// ── micro-moments after a pick ─────────────────────────────────────────────────
export interface TacticalMoment {
  /** i18n key (tac.*). */
  key: string;
  tone: "unit" | "up" | "down";
  /** The line to light up on the pitch, for unit moments. */
  unit?: Unit;
}

const FRONT_KEY: Record<number, string> = { 1: "tac.unit.front1", 2: "tac.unit.front2", 3: "tac.unit.front3", 4: "tac.unit.front4" };

/**
 * The single most meaningful change a pick made to the XI's structure, or null.
 * Order: a line just completed (with its verdict for the midfield) → a new tactical connection →
 * a dimension crossing its threshold (only once 7+ players are in, when team numbers mean something).
 */
export function tacticalMoment(
  before: readonly (PlayerEra | null)[],
  after: readonly (PlayerEra | null)[],
  formation: Formation,
  engineVersion: string = ENGINE_VERSION,
): TacticalMoment | null {
  const u0 = unitFill(before, formation);
  const u1 = unitFill(after, formation);
  const done = (u: Unit) => u1[u].total > 0 && u1[u].filled === u1[u].total && u0[u].filled < u0[u].total;

  if (done("MID")) {
    const mids = lineupEntries(after, formation).filter((e) => lineOfEntry(e) === "MID");
    const conns = tacticalConnections(after, formation);
    if (mids.length >= 2 && !mids.some((e) => is(e, "BW", "ANC", "B2B"))) return { key: "tac.m.noBallWinner", tone: "down", unit: "MID" };
    if (conns.some((c) => c.id === "balancedMidfield")) return { key: "tac.m.midBalanced", tone: "unit", unit: "MID" };
    return { key: "tac.unit.mid", tone: "unit", unit: "MID" };
  }
  if (done("DEF")) return { key: "tac.unit.def", tone: "unit", unit: "DEF" };
  if (done("ATT")) return { key: FRONT_KEY[u1.ATT.total] ?? "tac.unit.front3", tone: "unit", unit: "ATT" };

  const had = new Set(tacticalConnections(before, formation).map((c) => c.id));
  const fresh = tacticalConnections(after, formation).find((c) => !had.has(c.id));
  if (fresh) return { key: `tac.c.${fresh.id}`, tone: "up" };

  const n = after.filter(Boolean).length;
  if (n >= 7 && before.filter(Boolean).length >= 6) {
    const d0 = rateLineup(before, formation, engineVersion).dims;
    const d1 = rateLineup(after, formation, engineVersion).dims;
    const crossed = (d: TacticalDimension) => d0[d] < DIM_RULES[d].threshold && d1[d] >= DIM_RULES[d].threshold;
    if (crossed("width")) return { key: "tac.m.widthRestored", tone: "up" };
    if (crossed("coverage")) return { key: "tac.m.coverageUp", tone: "up" };
    if (crossed("ballWinning")) return { key: "tac.m.ballWinningUp", tone: "up" };
  }
  return null;
}

// ── team sheet: identity, structural players, game plan ────────────────────────
export interface KeyPlayer {
  kind: "creator" | "balance" | "threat";
  slot: number;
  name: string;
}

export interface GamePlanLine {
  phase: "possession" | "creation" | "defending" | "threat";
  key: string;
  params?: Record<string, string>;
}

export interface TeamSheet {
  /** 2–3 i18n keys (tac.id.*, tac.str.*, tac.weak.*). */
  identity: string[];
  keyPlayers: KeyPlayer[];
  plan: GamePlanLine[];
  connections: Connection[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * What a "typical" complete XI looks like (mean, standard deviation), measured on 600 drafts made
 * with engine v6 by a FIT-aware bot. Identity and game plan speak in deviations from this, so a
 * label means "more than most XIs", not "above an arbitrary number".
 */
const NORMS: Record<TacticalDimension | "pressFront" | "defPace", [number, number]> = {
  width: [74.9, 6.5], finishing: [88.2, 3.6], creation: [87.7, 3.6], progression: [80.7, 2.8], retention: [82.5, 2.4],
  coverage: [79.3, 2.3], ballWinning: [82.2, 3.9], pace: [81.4, 2.8], aerial: [84.4, 3.7], buildUp: [76.4, 4.2],
  pressFront: [78.3, 2.8], defPace: [79.7, 2.7],
};
const zOf = (k: keyof typeof NORMS, v: number) => (v - NORMS[k][0]) / NORMS[k][1];

const WEAK_FROM_SYNERGY: Record<string, string> = {
  transition: "tac.weak.transitions",
  narrowLeft: "tac.weak.narrowLeft",
  narrowRight: "tac.weak.narrowRight",
  narrow: "tac.weak.narrow",
  slowLine: "tac.weak.slowLine",
  noBallWinner: "tac.weak.noBallWinner",
  sameSpace: "tac.weak.sameSpace",
};

export function teamSheet(lineup: readonly (PlayerEra | null)[], formation: Formation, engineVersion: string = ENGINE_VERSION): TeamSheet {
  const entries = lineupEntries(lineup, formation);
  const r = rateLineup(lineup, formation, engineVersion);
  const d = r.dims;
  const outfield = entries.filter((e) => e.slot.position !== "GK");

  const z = (k: TacticalDimension) => zOf(k, d[k]);

  // Identity 1 — the style the numbers describe (relative to a typical XI).
  const styles: [string, number][] = [
    ["tac.id.possession", avg([z("retention"), z("buildUp"), z("progression")])],
    ["tac.id.transition", avg([z("pace"), z("finishing")])],
    ["tac.id.direct", (z("aerial") - z("buildUp")) / 2],
    ["tac.id.wide", z("width")],
  ];
  styles.sort((a, b) => b[1] - a[1]);
  const identity: string[] = [styles[0]![1] >= 0.35 ? styles[0]![0] : "tac.id.balanced"];

  // Identity 2 — the clearest strength.
  const centralCreators = outfield.filter((e) => sideOf(e) === "C" && lineOfEntry(e) !== "DEF" && effective(e, "creation") >= 84).length;
  const byZ = [...DIMENSIONS].sort((a, b) => z(b) - z(a));
  const top = byZ[0]!;
  if (z(top) >= 0.8) identity.push(top === "creation" ? (centralCreators >= 2 ? "tac.str.creationCentral" : "tac.str.creationWide") : `tac.str.${top}`);

  // Identity 3 — the vulnerability: a role relationship first, then a dimension under its FIT
  // threshold (it costs points), then a clear relative weakness.
  const neg = (r.synergies ?? []).filter((s) => s.delta < 0).sort((a, b) => a.delta - b.delta)[0];
  const penalty = [...DIMENSIONS].map((k) => [k, (DIM_RULES[k].threshold - d[k]) * DIM_RULES[k].weight] as const).sort((a, b) => b[1] - a[1])[0]!;
  const low = byZ[byZ.length - 1]!;
  if (neg && WEAK_FROM_SYNERGY[neg.id]) identity.push(WEAK_FROM_SYNERGY[neg.id]!);
  else if (penalty[1] >= 1.5) identity.push(`tac.weak.${penalty[0]}`);
  else if (z(low) <= -0.8) identity.push(`tac.weak.${low}`);

  // Structural players (distinct).
  const used = new Set<number>();
  const best = (pool: LineupEntry[], score: (e: LineupEntry) => number) => {
    let b: LineupEntry | null = null;
    for (const e of pool) if (!used.has(e.index) && (!b || score(e) > score(b))) b = e;
    if (b) used.add(b.index);
    return b;
  };
  const threat = best(
    outfield.filter((e) => lineOfEntry(e) === "ATT" || e.slot.position === "AM"),
    (e) => effective(e, "finishing") * 0.7 + effective(e, "pace") * 0.15 + effective(e, "aerial") * 0.15,
  );
  const creator = best(
    outfield.filter((e) => e.slot.position !== "CB"),
    (e) => effective(e, "creation") * 0.65 + effective(e, "progression") * 0.35,
  );
  const balance = best(
    outfield.filter((e) => ["DM", "CM"].includes(e.slot.position)),
    (e) => (effective(e, "defence") + effective(e, "pressing")) * 0.3 + effective(e, "retention") * 0.4,
  );
  const keyPlayers: KeyPlayer[] = [];
  if (creator) keyPlayers.push({ kind: "creator", slot: creator.index, name: creator.player.shortName });
  if (balance) keyPlayers.push({ kind: "balance", slot: balance.index, name: balance.player.shortName });
  if (threat) keyPlayers.push({ kind: "threat", slot: threat.index, name: threat.player.shortName });

  // Game plan.
  const plan: GamePlanLine[] = [];
  const poss = avg([z("retention"), z("buildUp"), z("progression")]);
  plan.push({
    phase: "possession",
    key:
      poss >= 0.6
        ? "tac.plan.pos.patient"
        : z("progression") >= 0.6 && z("pace") >= 0.3
          ? "tac.plan.pos.vertical"
          : z("buildUp") <= -0.8 || (z("aerial") >= 0.8 && z("retention") < 0)
            ? "tac.plan.pos.direct"
            : "tac.plan.pos.balanced",
  });
  const creators = outfield.filter((e) => lineOfEntry(e) !== "DEF" && effective(e, "creation") >= 84);
  const central = creators.filter((e) => sideOf(e) === "C").length;
  const wide = outfield.filter((e) => sideOf(e) !== "C" && is(e, "WNG", "FB", "WB") && effective(e, "creation") >= 78).length;
  const no10 = entries.some((e) => e.slot.position === "AM" && is(e, "PM", "F9"));
  const star = creators.length ? Math.max(...creators.map((e) => e.player.creation)) : 0;
  plan.push({
    phase: "creation",
    key: no10 ? "tac.plan.cre.no10" : central >= 2 ? "tac.plan.cre.central" : wide >= 2 ? "tac.plan.cre.wide" : star >= 92 && creators.length <= 2 ? "tac.plan.cre.star" : "tac.plan.cre.shared",
  });
  const pressFront = avg(outfield.filter((e) => lineOfEntry(e) !== "DEF").map((e) => effective(e, "pressing")));
  const defPace = avg(outfield.filter((e) => lineOfEntry(e) === "DEF").map((e) => e.player.pace));
  plan.push({
    phase: "defending",
    key:
      zOf("pressFront", pressFront) >= 0.7 || (entries.some((e) => is(e, "PRS")) && z("ballWinning") >= 0.3)
        ? "tac.plan.def.press"
        : z("coverage") >= 0.6 && zOf("defPace", defPace) <= -0.3
          ? "tac.plan.def.deep"
          : "tac.plan.def.mid",
  });
  if (threat) {
    const side = sideOf(threat);
    const p = threat.player;
    const key =
      side !== "C" && p.pace >= 85
        ? side === "L" ? "tac.plan.thr.fastLeft" : "tac.plan.thr.fastRight"
        : side === "C" && (is(threat, "TM") || p.aerial >= 88)
          ? "tac.plan.thr.aerial"
          : side === "C" && p.finishing >= 88
            ? "tac.plan.thr.clinical"
            : side === "L" ? "tac.plan.thr.left" : side === "R" ? "tac.plan.thr.right" : "tac.plan.thr.central";
    plan.push({ phase: "threat", key, params: { name: p.shortName } });
  }

  return { identity, keyPlayers, plan, connections: tacticalConnections(lineup, formation) };
}

/**
 * Style coordinates of one XI (deviations from a typical XI) — the raw material of the Football DNA
 * profile. control: retention + build-up · vertical: progression + pace · width · technical: ball
 * skills minus physique across the outfield.
 */
export function tacticalStyle(lineup: readonly (PlayerEra | null)[], formation: Formation, engineVersion: string = ENGINE_VERSION): { control: number; vertical: number; width: number; technical: number } {
  const d = rateLineup(lineup, formation, engineVersion).dims;
  const outfield = lineupEntries(lineup, formation).filter((e) => e.slot.position !== "GK");
  const tech = avg(outfield.map((e) => (e.player.retention + e.player.creation) / 2 - (e.player.physical + e.player.pace) / 2));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    control: r2(avg([zOf("retention", d.retention), zOf("buildUp", d.buildUp)])),
    vertical: r2(avg([zOf("progression", d.progression), zOf("pace", d.pace)])),
    width: r2(zOf("width", d.width)),
    technical: r2(tech / 6),
  };
}
