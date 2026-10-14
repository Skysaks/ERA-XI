import type { DraftConfig, DraftOffer, DraftState, FormationId, Impact, PlayerEra } from "@/types";
import { getPlayerEra } from "@/data";
import { autoPlace } from "./autoPlacement";
import { pickImpacts, rateLineup } from "./fit";
import { getFormation } from "./formation";
import { ERA_BUCKETS, generateDraw, oneClubIds, oneLeagueIds } from "./draftGeneration";
import { assessSlot } from "./ratings";
import { ROUNDS } from "./version";
import { RULESETS, drawRulesOf } from "./rulesets";
import { applyEvent, eventById } from "./events";
import { resolveOffer } from "./director";

export class DraftError extends Error {}

/** A pre-draft choice is only valid for the ruleset that offers it. */
export function validChoice(config: DraftConfig): boolean {
  const c = config.choice;
  if (!c) return true;
  const kind = RULESETS[config.mode].playerChoice;
  if ("bucket" in c) return kind === "bucket" && ERA_BUCKETS.includes(c.bucket);
  if ("league" in c) return kind === "league" && oneLeagueIds(config.engineVersion).includes(c.league);
  return kind === "club" && oneClubIds(config.engineVersion).includes(c.clubId);
}

export function createDraft(config: DraftConfig): DraftState {
  if (!validChoice(config)) throw new DraftError("Invalid pre-draft choice for this mode");
  const hasEvent = Boolean(config.event && eventById(config.event));
  // Weekly runs need their event; from engine v6 the Daily XI may follow the week's theme.
  const eventOk = config.mode === "weekly" ? hasEvent : !config.event || (config.mode === "daily" && Number(config.engineVersion) >= 6 && hasEvent);
  if (!eventOk) throw new DraftError("Weekly runs need a known event");
  const draw = generateDraw(config.seed, config.engineVersion, applyEvent(drawRulesOf(RULESETS[config.mode]), config.event), {
    formation: config.formation,
    choice: config.choice,
  });
  const state: DraftState = {
    config,
    draw,
    round: 0,
    picks: [],
    rerollRound: null,
    lineup: new Array<string | null>(getFormation(config.formation).slots.length).fill(null),
  };
  return withShownOffer(state);
}

/** Engine v4+: resolve (Draft Director) and remember the offer of the current round. */
function withShownOffer(state: DraftState): DraftState {
  if (Number(state.config.engineVersion) < 4 || isDraftComplete(state)) return state;
  const base = state.rerollRound === state.round ? state.draw.reserve : state.draw.rounds[state.round];
  if (!base) return state;
  const shown = (state.shown ?? []).slice(0, state.round);
  shown[state.round] = resolveOffer(state, base);
  return { ...state, shown };
}

export function isDraftComplete(state: DraftState): boolean {
  return state.round >= ROUNDS;
}

export function currentOffer(state: DraftState): DraftOffer | null {
  if (isDraftComplete(state)) return null;
  const shown = state.shown?.[state.round];
  if (shown) return shown;
  if (state.rerollRound === state.round) return state.draw.reserve;
  return state.draw.rounds[state.round] ?? null;
}

export function rerollsAllowed(state: DraftState): number {
  return RULESETS[state.config.mode].rerolls;
}

export function canReroll(state: DraftState): boolean {
  return rerollsAllowed(state) > 0 && state.rerollRound === null && !isDraftComplete(state);
}

/** Exactly one reroll per draft; swaps the current offer for the reserve offer. */
export function reroll(state: DraftState): DraftState {
  if (!canReroll(state)) throw new DraftError("Reroll not available");
  return withShownOffer({ ...state, rerollRound: state.round });
}

export function lineupPlayers(state: DraftState): (PlayerEra | null)[] {
  return state.lineup.map((id) => (id ? getPlayerEra(id) : null));
}

/** Position Draft: the slot the current round must fill (null in every other mode). */
export function targetSlot(state: DraftState): number | null {
  return state.draw.targets?.[state.round] ?? null;
}

/** Auto-placement, except in Position Draft where the pick goes straight to the named slot. */
function placeFor(state: DraftState, before: (PlayerEra | null)[], player: PlayerEra): (PlayerEra | null)[] {
  const target = targetSlot(state);
  if (target === null) return autoPlace(before, player, getFormation(state.config.formation));
  if (before[target]) throw new DraftError("Target slot already filled");
  const after = before.slice();
  after[target] = player;
  return after;
}

export interface PickOutcome {
  state: DraftState;
  slotIndex: number;
  impacts: Impact[];
}

export function pickOption(state: DraftState, optionIndex: number): PickOutcome {
  const offer = currentOffer(state);
  if (!offer) throw new DraftError("Draft already complete");
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= offer.options.length) {
    throw new DraftError(`Invalid option ${optionIndex}`);
  }
  const id = offer.options[optionIndex];
  if (!id) throw new DraftError("Missing option");
  const player = getPlayerEra(id);
  const before = lineupPlayers(state);
  if (before.some((p) => p?.playerId === player.playerId)) throw new DraftError("Player already in XI");

  const formation = getFormation(state.config.formation);
  const after = placeFor(state, before, player);
  const slotIndex = after.findIndex((p) => p?.id === player.id);
  const impacts = pickImpacts(before, after, slotIndex, formation, state.config.engineVersion);

  return {
    slotIndex,
    impacts,
    state: withShownOffer({
      ...state,
      round: state.round + 1,
      picks: [...state.picks, { round: state.round, optionIndex, playerEraId: id, rerolled: state.rerollRound === state.round }],
      lineup: after.map((p) => p?.id ?? null),
    }),
  };
}

export interface PickPreview {
  slotIndex: number;
  position: import("@/types").Position;
  outOfPosition: boolean;
  /** Slot rating minus the player's displayed overall (negative = he loses value there). */
  ratingDelta: number;
  /** FIT after the pick minus FIT now (only meaningful once a few players are in). */
  fitDelta: number;
  /** Other players the auto-placement would move to make room. */
  moves: number;
  /**
   * The team dimension this pick would lift most (presentation only): from the team numbers once
   * 3+ players are in, else from the player's role — "CREATION ↑" on the option card.
   */
  dimUp: import("@/types").TacticalDimension | null;
}

/** What a role mainly brings, for the first picks (before team numbers mean anything). */
const ROLE_DIM: Partial<Record<import("@/types").Role, import("@/types").TacticalDimension>> = {
  SK: "buildUp", BPD: "buildUp", STP: "coverage", FB: "width", DFB: "coverage", WB: "width", ANC: "coverage", BW: "ballWinning",
  DLP: "progression", B2B: "ballWinning", PM: "creation", WNG: "width", IF: "finishing", TM: "aerial", PCH: "finishing", F9: "creation",
  CF: "finishing", PRS: "ballWinning",
};

/**
 * What would happen if this option were picked now — computed locally and instantly,
 * so the draft can show "→ LW −6 · FIT −4" before the tap without adding a step.
 */
export function previewPick(state: DraftState, optionIndex: number): PickPreview | null {
  const offer = currentOffer(state);
  const id = offer?.options[optionIndex];
  if (!id) return null;
  const player = getPlayerEra(id);
  const formation = getFormation(state.config.formation);
  const before = lineupPlayers(state);
  const after = placeFor(state, before, player);
  const slotIndex = after.findIndex((p) => p?.id === id);
  const slot = formation.slots[slotIndex];
  if (!slot) return null;
  const a = assessSlot(player, slot.position);
  const count = before.filter(Boolean).length;
  const rBefore = count ? rateLineup(before, formation, state.config.engineVersion) : null;
  const rAfter = rateLineup(after, formation, state.config.engineVersion);
  const fitBefore = rBefore ? rBefore.fit : 100;
  const fitAfter = rAfter.fit;
  let dimUp: PickPreview["dimUp"] = null;
  if (rBefore && count >= 3) {
    let gain = 2;
    for (const [d, v] of Object.entries(rAfter.dims) as [import("@/types").TacticalDimension, number][]) {
      const delta = v - rBefore.dims[d];
      if (delta > gain) {
        gain = delta;
        dimUp = d;
      }
    }
  } else dimUp = ROLE_DIM[player.roles[0] as import("@/types").Role] ?? null;
  let moves = 0;
  before.forEach((p, i) => {
    if (p && after[i]?.id !== p.id) moves++;
  });
  return {
    slotIndex,
    position: slot.position,
    outOfPosition: a.outOfPosition,
    ratingDelta: Math.round(a.rating - player.overall),
    fitDelta: fitAfter - fitBefore,
    moves,
    dimUp,
  };
}

/** Where an option would land if picked now. */
export function previewPlacement(state: DraftState, optionIndex: number): { slotIndex: number; outOfPosition: boolean } | null {
  const p = previewPick(state, optionIndex);
  return p ? { slotIndex: p.slotIndex, outOfPosition: p.outOfPosition } : null;
}

/** Manual swap on the complete XI. Any two slots may be swapped; penalties apply. */
export function swapSlots(state: DraftState, a: number, b: number): DraftState {
  const n = state.lineup.length;
  if (a === b || a < 0 || b < 0 || a >= n || b >= n) return state;
  const lineup = state.lineup.slice();
  const tmp = lineup[a] ?? null;
  lineup[a] = lineup[b] ?? null;
  lineup[b] = tmp;
  return { ...state, lineup };
}

/** The formation the XI plays in: the post-draft choice if any, else the draft formation. */
export function formationOf(state: DraftState): FormationId {
  return state.formation ?? state.config.formation;
}

export function draftRatings(state: DraftState) {
  return rateLineup(lineupPlayers(state), getFormation(formationOf(state)), state.config.engineVersion);
}

/** Slot index → round index of the player in that slot (for challenge encoding). */
export function layoutOf(state: DraftState): number[] {
  return state.lineup.map((id) => state.picks.findIndex((p) => p.playerEraId === id));
}

/** Rebuild a finished draft from decisions only. Used by challenges and tests. */
export function replayDraft(
  config: DraftConfig,
  choices: readonly number[],
  rerollRound: number | null,
  layout?: readonly number[],
  formation?: FormationId,
): DraftState {
  let state = createDraft(config);
  for (let r = 0; r < choices.length; r++) {
    if (rerollRound === r) state = reroll(state);
    state = pickOption(state, choices[r] ?? -1).state;
  }
  if (formation && formation !== config.formation) {
    if (Number(config.engineVersion) < 4 || !isDraftComplete(state)) throw new DraftError("Formation change needs a complete v4 draft");
    state = { ...state, formation };
  }
  if (layout) {
    if (!isDraftComplete(state)) throw new DraftError("Layout on incomplete draft");
    const seen = new Set(layout);
    if (layout.length !== state.lineup.length || seen.size !== layout.length || layout.some((r) => r < 0 || r >= ROUNDS)) {
      throw new DraftError("Invalid layout");
    }
    state = { ...state, lineup: layout.map((r) => state.picks[r]?.playerEraId ?? null) };
  }
  return state;
}
