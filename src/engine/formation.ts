import type { Formation, FormationId, FormationSlot, Position } from "@/types";

function s(id: string, position: Position, x: number, y: number): FormationSlot {
  return { id, position, x, y };
}

const GK = s("GK", "GK", 50, 4);

export const FORMATIONS: Record<FormationId, Formation> = {
  "433": {
    id: "433",
    label: "4-3-3",
    slots: [
      GK,
      s("LB", "LB", 12, 27),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 27),
      s("DM", "DM", 50, 42),
      s("LCM", "CM", 28, 55),
      s("RCM", "CM", 72, 55),
      s("LW", "LW", 15, 78),
      s("ST", "ST", 50, 86),
      s("RW", "RW", 85, 78),
    ],
  },
  "4231": {
    id: "4231",
    label: "4-2-3-1",
    slots: [
      GK,
      s("LB", "LB", 12, 27),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 27),
      s("LDM", "DM", 35, 42),
      s("RDM", "DM", 65, 42),
      s("LW", "LW", 15, 70),
      s("AM", "AM", 50, 66),
      s("RW", "RW", 85, 70),
      s("ST", "ST", 50, 87),
    ],
  },
  "442": {
    id: "442",
    label: "4-4-2",
    slots: [
      GK,
      s("LB", "LB", 12, 26),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 26),
      s("LM", "LM", 13, 55),
      s("LCM", "CM", 38, 50),
      s("RCM", "CM", 62, 50),
      s("RM", "RM", 87, 55),
      s("LST", "ST", 36, 84),
      s("RST", "ST", 64, 84),
    ],
  },
  "352": {
    id: "352",
    label: "3-5-2",
    slots: [
      GK,
      s("LCB", "CB", 25, 22),
      s("CB", "CB", 50, 23),
      s("RCB", "CB", 75, 22),
      s("LWB", "LWB", 10, 50),
      s("DM", "DM", 50, 42),
      s("LCM", "CM", 31, 58),
      s("RCM", "CM", 69, 58),
      s("RWB", "RWB", 90, 50),
      s("LST", "ST", 37, 85),
      s("RST", "ST", 63, 85),
    ],
  },
  "343": {
    id: "343",
    label: "3-4-3",
    slots: [
      GK,
      s("LCB", "CB", 25, 22),
      s("CB", "CB", 50, 23),
      s("RCB", "CB", 75, 22),
      s("LWB", "LWB", 10, 50),
      s("LCM", "CM", 37, 48),
      s("RCM", "CM", 63, 48),
      s("RWB", "RWB", 90, 50),
      s("LW", "LW", 17, 78),
      s("ST", "ST", 50, 86),
      s("RW", "RW", 83, 78),
    ],
  },
  "4312": {
    id: "4312",
    label: "4-3-1-2",
    slots: [
      GK,
      s("LB", "LB", 12, 27),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 27),
      s("LCM", "CM", 27, 48),
      s("CM", "CM", 50, 44),
      s("RCM", "CM", 73, 48),
      s("AM", "AM", 50, 66),
      s("LST", "ST", 37, 85),
      s("RST", "ST", 63, 85),
    ],
  },
  "41212": {
    id: "41212",
    label: "4-1-2-1-2",
    slots: [
      GK,
      s("LB", "LB", 12, 27),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 27),
      s("DM", "DM", 50, 40),
      s("LCM", "CM", 30, 53),
      s("RCM", "CM", 70, 53),
      s("AM", "AM", 50, 67),
      s("LST", "ST", 37, 85),
      s("RST", "ST", 63, 85),
    ],
  },
  "4321": {
    id: "4321",
    label: "4-3-2-1",
    slots: [
      GK,
      s("LB", "LB", 12, 27),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 27),
      s("LCM", "CM", 27, 49),
      s("DM", "DM", 50, 42),
      s("RCM", "CM", 73, 49),
      s("LAM", "AM", 33, 69),
      s("RAM", "AM", 67, 69),
      s("ST", "ST", 50, 87),
    ],
  },
  "424": {
    id: "424",
    label: "4-2-4",
    slots: [
      GK,
      s("LB", "LB", 12, 26),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 26),
      s("LCM", "CM", 37, 48),
      s("RCM", "CM", 63, 48),
      s("LW", "LW", 13, 76),
      s("LST", "ST", 38, 85),
      s("RST", "ST", 62, 85),
      s("RW", "RW", 87, 76),
    ],
  },
  "4222": {
    id: "4222",
    label: "4-2-2-2",
    slots: [
      GK,
      s("LB", "LB", 12, 27),
      s("LCB", "CB", 37, 22),
      s("RCB", "CB", 63, 22),
      s("RB", "RB", 88, 27),
      s("LDM", "DM", 36, 42),
      s("RDM", "DM", 64, 42),
      s("LAM", "AM", 24, 65),
      s("RAM", "AM", 76, 65),
      s("LST", "ST", 38, 86),
      s("RST", "ST", 62, 86),
    ],
  },
  "3421": {
    id: "3421",
    label: "3-4-2-1",
    slots: [
      GK,
      s("LCB", "CB", 25, 22),
      s("CB", "CB", 50, 23),
      s("RCB", "CB", 75, 22),
      s("LWB", "LWB", 10, 50),
      s("LCM", "CM", 37, 47),
      s("RCM", "CM", 63, 47),
      s("RWB", "RWB", 90, 50),
      s("LAM", "AM", 33, 70),
      s("RAM", "AM", 67, 70),
      s("ST", "ST", 50, 87),
    ],
  },
  "532": {
    id: "532",
    label: "5-3-2",
    slots: [
      GK,
      s("LWB", "LWB", 9, 34),
      s("LCB", "CB", 30, 21),
      s("CB", "CB", 50, 20),
      s("RCB", "CB", 70, 21),
      s("RWB", "RWB", 91, 34),
      s("LCM", "CM", 29, 53),
      s("DM", "DM", 50, 45),
      s("RCM", "CM", 71, 53),
      s("LST", "ST", 37, 84),
      s("RST", "ST", 63, 84),
    ],
  },
  "523": {
    id: "523",
    label: "5-2-3",
    slots: [
      GK,
      s("LWB", "LWB", 9, 34),
      s("LCB", "CB", 30, 21),
      s("CB", "CB", 50, 20),
      s("RCB", "CB", 70, 21),
      s("RWB", "RWB", 91, 34),
      s("LCM", "CM", 37, 50),
      s("RCM", "CM", 63, 50),
      s("LW", "LW", 17, 77),
      s("ST", "ST", 50, 86),
      s("RW", "RW", 83, 77),
    ],
  },
};

/** The five classic shapes shown by default (Home keeps the recently used ones up front). */
export const FORMATION_IDS: FormationId[] = ["433", "4231", "442", "352", "343"];
/** Every formation the engine supports (the expanded selector, XI Complete's Formation sheet). */
export const ALL_FORMATION_IDS: FormationId[] = ["433", "4231", "442", "4312", "41212", "4321", "424", "4222", "343", "3421", "352", "532", "523"];

export function getFormation(id: FormationId): Formation {
  return FORMATIONS[id];
}

export function isFormationId(value: string): value is FormationId {
  return (ALL_FORMATION_IDS as string[]).includes(value);
}

/** Structural validation: 11 slots, exactly one GK, unique ids, coordinates in range. */
export function validateFormation(f: Formation): string[] {
  const errors: string[] = [];
  if (f.slots.length !== 11) errors.push(`${f.id}: expected 11 slots, got ${f.slots.length}`);
  const gks = f.slots.filter((x) => x.position === "GK").length;
  if (gks !== 1) errors.push(`${f.id}: expected 1 GK, got ${gks}`);
  const ids = new Set(f.slots.map((x) => x.id));
  if (ids.size !== f.slots.length) errors.push(`${f.id}: duplicate slot ids`);
  for (const slot of f.slots) {
    if (slot.x < 0 || slot.x > 100 || slot.y < 0 || slot.y > 100) errors.push(`${f.id}: ${slot.id} out of bounds`);
  }
  return errors;
}
