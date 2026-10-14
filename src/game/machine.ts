/**
 * Explicit game state machine. One discriminated union, one reducer, no loose booleans.
 * The reducer is pure: seeds and timestamps arrive in actions.
 */
import type { DraftConfig, DraftState, Impact, SeasonResult } from "@/types";
import {
  compareRuns,
  createDraft,
  isDraftComplete,
  pickOption,
  reroll,
  canReroll,
  runSeason,
  swapSlots,
  type RivalComparison,
  type VerifiedChallenge,
} from "@/engine";

export interface RunContext {
  /** Present when this run is an answer to a friend's challenge. */
  challenge: VerifiedChallenge | null;
  /** Name to aim the result at (rematch flow). */
  rival: string | null;
  startedAt: number;
  /** Practice run (Replay from round n, Draft Lab): shown, never recorded as an official result. */
  practice?: boolean;
}

export interface LastPick {
  key: number;
  slotIndex: number;
  impacts: Impact[];
  playerEraId: string;
}

export type GameState =
  | { phase: "HOME"; notice: string | null }
  | { phase: "CHALLENGE_INTRO"; challenge: VerifiedChallenge }
  | { phase: "DRAFTING"; run: RunContext; draft: DraftState; lastPick: LastPick | null; selectedSlot?: number | null }
  | { phase: "XI_COMPLETE"; run: RunContext; draft: DraftState; selectedSlot: number | null }
  | { phase: "SIMULATING"; run: RunContext; draft: DraftState; result: SeasonResult }
  | { phase: "RESULT"; run: RunContext; draft: DraftState; result: SeasonResult }
  | { phase: "CHALLENGE_RESULT"; run: RunContext; draft: DraftState; result: SeasonResult; comparison: RivalComparison };

export type GameAction =
  | { type: "START"; config: DraftConfig; challenge?: VerifiedChallenge | null; rival?: string | null; now: number }
  | { type: "OPEN_CHALLENGE"; challenge: VerifiedChallenge }
  | { type: "CHALLENGE_REJECTED"; notice: string }
  | { type: "PICK"; optionIndex: number }
  | { type: "REROLL" }
  | { type: "TAP_SLOT"; index: number }
  | { type: "SIMULATE" }
  | { type: "REVEAL_DONE" }
  | { type: "RESUME"; draft: DraftState; run: RunContext }
  /** XI Complete: formation change, OPTIMISE XI, undo — the player applied it. */
  | { type: "SET_DRAFT"; draft: DraftState }
  | { type: "CLEAR_SELECTION" }
  | { type: "HOME" };

export const initialState: GameState = { phase: "HOME", notice: null };

function finish(run: RunContext, draft: DraftState, result: SeasonResult): GameState {
  if (!run.challenge) return { phase: "RESULT", run, draft, result };
  const c = run.challenge;
  const comparison = compareRuns(
    { state: draft, ratings: result.teamRatings, points: result.points },
    { state: c.creatorState, ratings: c.creatorResult.teamRatings, points: c.creatorResult.points },
    c.creatorName ?? "Your friend",
  );
  return { phase: "CHALLENGE_RESULT", run, draft, result, comparison };
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "START":
      return {
        phase: "DRAFTING",
        run: { challenge: action.challenge ?? null, rival: action.rival ?? null, startedAt: action.now },
        draft: createDraft(action.config),
        lastPick: null,
      };

    case "OPEN_CHALLENGE":
      return { phase: "CHALLENGE_INTRO", challenge: action.challenge };

    case "CHALLENGE_REJECTED":
      return { phase: "HOME", notice: action.notice };

    case "PICK": {
      if (state.phase !== "DRAFTING") return state;
      const out = pickOption(state.draft, action.optionIndex);
      if (isDraftComplete(out.state)) {
        return { phase: "XI_COMPLETE", run: state.run, draft: out.state, selectedSlot: null };
      }
      return {
        ...state,
        selectedSlot: null,
        draft: out.state,
        lastPick: {
          key: (state.lastPick?.key ?? 0) + 1,
          slotIndex: out.slotIndex,
          impacts: out.impacts,
          playerEraId: out.state.picks[out.state.picks.length - 1]?.playerEraId ?? "",
        },
      };
    }

    case "REROLL":
      if (state.phase !== "DRAFTING" || !canReroll(state.draft)) return state;
      return { ...state, draft: reroll(state.draft), lastPick: null };

    case "TAP_SLOT": {
      // Tap a player, then a destination: move (or swap). Works while drafting too (never in
      // Position Draft, where every round's slot is fixed). Empty slots can't start a move.
      if (state.phase !== "XI_COMPLETE" && state.phase !== "DRAFTING") return state;
      if (state.phase === "DRAFTING" && state.draft.draw.targets) return state;
      const selected = state.selectedSlot ?? null;
      if (selected === null) return state.draft.lineup[action.index] ? { ...state, selectedSlot: action.index } : state;
      if (selected === action.index) return { ...state, selectedSlot: null };
      return { ...state, draft: swapSlots(state.draft, selected, action.index), selectedSlot: null };
    }

    case "CLEAR_SELECTION":
      if (state.phase !== "XI_COMPLETE" && state.phase !== "DRAFTING") return state;
      return { ...state, selectedSlot: null };

    case "SET_DRAFT":
      if (state.phase !== "XI_COMPLETE") return state;
      return { ...state, draft: action.draft, selectedSlot: null };

    case "SIMULATE":
      if (state.phase !== "XI_COMPLETE") return state;
      // Computed instantly; the reveal is presentation only.
      return { phase: "SIMULATING", run: state.run, draft: state.draft, result: runSeason(state.draft) };

    case "REVEAL_DONE":
      if (state.phase !== "SIMULATING") return state;
      return finish(state.run, state.draft, state.result);

    case "RESUME":
      return isDraftComplete(action.draft)
        ? { phase: "XI_COMPLETE", run: action.run, draft: action.draft, selectedSlot: null }
        : { phase: "DRAFTING", run: action.run, draft: action.draft, lastPick: null };

    case "HOME":
      return { phase: "HOME", notice: null };
  }
}
