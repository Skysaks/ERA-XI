import type { AttributeKey, Attributes, Position, Role } from "@/types";
import { positionScore } from "@/engine/weights";

/**
 * Attribute shape per archetype, as offsets from the player's overall rating.
 * Real values = clamp(overall + offset + per-player override).
 * Keeps the dataset compact while giving every player a coherent profile.
 */
type Shape = Partial<Record<AttributeKey, number>>;

const OUTFIELD_GK: Shape = { goalkeeping: -85, distribution: -80 };

export const ARCHETYPES: Record<Role, Shape> = {
  GK: { finishing: -75, creation: -62, progression: -55, retention: -40, defence: -48, pressing: -60, pace: -38, physical: -6, aerial: -2, buildUp: -26, goalkeeping: 0, distribution: -12 },
  SK: { finishing: -75, creation: -58, progression: -45, retention: -30, defence: -45, pressing: -55, pace: -24, physical: -8, aerial: -6, buildUp: -8, goalkeeping: -1, distribution: 0 },
  BPD: { finishing: -42, creation: -26, progression: -8, retention: -4, defence: 0, pressing: -8, pace: -10, physical: -4, aerial: -3, buildUp: 1, ...OUTFIELD_GK },
  STP: { finishing: -44, creation: -40, progression: -24, retention: -18, defence: 1, pressing: -3, pace: -9, physical: 2, aerial: 3, buildUp: -16, ...OUTFIELD_GK },
  FB: { finishing: -34, creation: -12, progression: -2, retention: -10, defence: -6, pressing: -4, pace: 2, physical: -8, aerial: -18, buildUp: -10, ...OUTFIELD_GK },
  DFB: { finishing: -44, creation: -24, progression: -13, retention: -11, defence: 0, pressing: -3, pace: -4, physical: -3, aerial: -10, buildUp: -13, ...OUTFIELD_GK },
  WB: { finishing: -28, creation: -9, progression: 0, retention: -10, defence: -10, pressing: -2, pace: 3, physical: -6, aerial: -20, buildUp: -12, ...OUTFIELD_GK },
  ANC: { finishing: -36, creation: -18, progression: -10, retention: -2, defence: 0, pressing: -2, pace: -14, physical: 0, aerial: -6, buildUp: -4, ...OUTFIELD_GK },
  BW: { finishing: -30, creation: -18, progression: -8, retention: -8, defence: -2, pressing: 3, pace: -6, physical: 1, aerial: -10, buildUp: -14, ...OUTFIELD_GK },
  DLP: { finishing: -26, creation: -3, progression: 0, retention: 2, defence: -14, pressing: -12, pace: -18, physical: -14, aerial: -22, buildUp: 2, ...OUTFIELD_GK },
  B2B: { finishing: -13, creation: -8, progression: -2, retention: -6, defence: -8, pressing: 0, pace: -6, physical: 0, aerial: -12, buildUp: -10, ...OUTFIELD_GK },
  PM: { finishing: -8, creation: 2, progression: -4, retention: 0, defence: -35, pressing: -18, pace: -10, physical: -20, aerial: -30, buildUp: -12, ...OUTFIELD_GK },
  WNG: { finishing: -12, creation: -3, progression: 0, retention: -8, defence: -40, pressing: -14, pace: 3, physical: -20, aerial: -35, buildUp: -25, ...OUTFIELD_GK },
  IF: { finishing: -2, creation: -6, progression: -2, retention: -6, defence: -42, pressing: -12, pace: 2, physical: -16, aerial: -30, buildUp: -28, ...OUTFIELD_GK },
  TM: { finishing: -2, creation: -18, progression: -22, retention: -6, defence: -38, pressing: -14, pace: -18, physical: 3, aerial: 3, buildUp: -30, ...OUTFIELD_GK },
  PCH: { finishing: 2, creation: -20, progression: -25, retention: -12, defence: -48, pressing: -18, pace: -2, physical: -12, aerial: -12, buildUp: -35, ...OUTFIELD_GK },
  F9: { finishing: -4, creation: 0, progression: -8, retention: 0, defence: -42, pressing: -12, pace: -8, physical: -18, aerial: -22, buildUp: -24, ...OUTFIELD_GK },
  CF: { finishing: 0, creation: -10, progression: -12, retention: -4, defence: -38, pressing: -8, pace: -4, physical: -4, aerial: -6, buildUp: -28, ...OUTFIELD_GK },
  PRS: { finishing: -6, creation: -14, progression: -14, retention: -10, defence: -30, pressing: 3, pace: -2, physical: -6, aerial: -14, buildUp: -30, ...OUTFIELD_GK },
};

export const ROLE_LABEL: Record<Role, string> = {
  GK: "Shot-stopper",
  SK: "Sweeper keeper",
  BPD: "Ball-playing CB",
  STP: "Stopper",
  FB: "Attacking full-back",
  DFB: "Defensive full-back",
  WB: "Wing-back",
  ANC: "Anchor",
  BW: "Ball winner",
  DLP: "Deep playmaker",
  B2B: "Box-to-box",
  PM: "Playmaker",
  WNG: "Winger",
  IF: "Inside forward",
  TM: "Target man",
  PCH: "Poacher",
  F9: "False nine",
  CF: "Complete forward",
  PRS: "Pressing forward",
};

const OVERRIDE_KEYS: Record<string, AttributeKey> = {
  fin: "finishing",
  cre: "creation",
  pro: "progression",
  ret: "retention",
  def: "defence",
  pre: "pressing",
  pac: "pace",
  phy: "physical",
  aer: "aerial",
  bui: "buildUp",
  gk: "goalkeeping",
  dis: "distribution",
};

const clamp = (v: number) => Math.max(5, Math.min(99, Math.round(v)));

/** "fin+4 pac-6" → { finishing: 4, pace: -6 } */
export function parseOverrides(src: string | undefined): Shape {
  const out: Shape = {};
  if (!src) return out;
  for (const token of src.trim().split(/\s+/)) {
    const m = /^([a-z]+)([+-]\d+)$/.exec(token);
    if (!m) throw new Error(`Bad attribute override "${token}"`);
    const key = OVERRIDE_KEYS[m[1] ?? ""];
    if (!key) throw new Error(`Unknown attribute "${m[1]}"`);
    out[key] = (out[key] ?? 0) + Number(m[2]);
  }
  return out;
}

export function buildAttributes(overall: number, role: Role, overrides: Shape): Attributes {
  const shape = ARCHETYPES[role];
  const attrs = {} as Attributes;
  const keys: AttributeKey[] = [
    "finishing",
    "creation",
    "progression",
    "retention",
    "defence",
    "pressing",
    "pace",
    "physical",
    "aerial",
    "buildUp",
    "goalkeeping",
    "distribution",
  ];
  for (const k of keys) attrs[k] = clamp(overall + (shape[k] ?? 0) + (overrides[k] ?? 0));
  return attrs;
}

/**
 * Displayed rating, derived from attributes rather than typed in.
 * The authored level anchors the scale; what moves the number is how the player's
 * own attribute profile (archetype + personal traits) scores against what his natural
 * position demands. A winger's extra pace counts; a centre-back's extra pace barely does.
 */
export function derivedOverall(level: number, role: Role, attrs: Attributes, natural: Position): number {
  const baseline = buildAttributes(level, role, {});
  const delta = positionScore(attrs, natural) - positionScore(baseline, natural);
  // Half weight: traits refine the anchor, they do not replace it (keeps legends consistent across eras).
  return Math.max(40, Math.min(99, Math.round(level + 0.5 * delta)));
}
