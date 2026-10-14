import type { DraftState, SeasonResult } from "@/types";
import { ROUNDS, compareRuns, simulateHeadToHead, type HeadToHead, type RivalComparison } from "@/engine";
import { seasonForSeed } from "./roomEngine";
import type { RoomSnapshot, SeatView } from "./types";

export interface DuelSide {
  seatId: string;
  nickname: string;
  draft: DraftState;
  result: SeasonResult;
}

export interface DuelOutcome {
  you: DuelSide;
  opponent: DuelSide;
  /** Season points decide. The direct XI-vs-XI match only breaks a tie. */
  winner: "you" | "opponent";
  decidedBy: "points" | "head_to_head";
  headToHead: { you: number; opponent: number; penalties: [number, number] | null; winner: "you" | "opponent" };
  comparison: RivalComparison;
}

function sideOf(snap: RoomSnapshot, seat: SeatView): DuelSide | null {
  if (seat.picks.length < ROUNDS || seat.picks.some((p) => p === null)) return null;
  const { draft, result } = seasonForSeed(snap.seed, snap.rulesetId, snap.formation, snap.engineVersion, seat.picks as number[]);
  return { seatId: seat.seatId, nickname: seat.nickname, draft, result };
}

/** Computed on the client from the verified snapshot; the server computes the same numbers. */
export function duelOutcome(snap: RoomSnapshot): DuelOutcome | null {
  const meSeat = snap.seats.find((s) => s.you);
  const oppSeat = snap.seats.find((s) => !s.you);
  if (!meSeat || !oppSeat) return null;
  const you = sideOf(snap, meSeat);
  const opponent = sideOf(snap, oppSeat);
  if (!you || !opponent) return null;

  // Canonical order (seat ids) so both players see the identical match.
  const youFirst = you.seatId < opponent.seatId;
  const [a, b] = youFirst ? [you, opponent] : [opponent, you];
  const m: HeadToHead = simulateHeadToHead(a.result.teamRatings, b.result.teamRatings, snap.seed, snap.engineVersion);
  const youGoals = youFirst ? m.goalsA : m.goalsB;
  const oppGoals = youFirst ? m.goalsB : m.goalsA;
  const pens = m.penalties ? (youFirst ? m.penalties : ([m.penalties[1], m.penalties[0]] as [number, number])) : null;
  const h2hWinner: "you" | "opponent" = (m.winner === "A") === youFirst ? "you" : "opponent";

  const byPoints = you.result.points - opponent.result.points;
  const winner = byPoints > 0 ? "you" : byPoints < 0 ? "opponent" : h2hWinner;

  const comparison = compareRuns(
    { state: you.draft, ratings: you.result.teamRatings, points: you.result.points },
    { state: opponent.draft, ratings: opponent.result.teamRatings, points: opponent.result.points },
    opponent.nickname,
    4,
  );
  return {
    you,
    opponent,
    winner,
    decidedBy: byPoints === 0 ? "head_to_head" : "points",
    headToHead: { you: youGoals, opponent: oppGoals, penalties: pens, winner: h2hWinner },
    comparison,
  };
}

export interface Standing {
  seatId: string;
  nickname: string;
  you: boolean;
  points: number | null;
  progress: number;
  connection: SeatView["connection"];
}

/** Party table: finished players by verified points, then everyone still drafting. */
export function standings(snap: RoomSnapshot): Standing[] {
  return snap.seats
    .map((s) => ({ seatId: s.seatId, nickname: s.nickname, you: s.you, points: s.score, progress: s.progress, connection: s.connection }))
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || b.progress - a.progress || a.nickname.localeCompare(b.nickname));
}
