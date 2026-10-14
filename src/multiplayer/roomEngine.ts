import type { DraftState, FormationId, SeasonResult } from "@/types";
import { RULESETS, ROUNDS, replayDraft, runSeason, seedFromLabel } from "@/engine";
import {
  fail,
  ok,
  type ConnectionState,
  type Intent,
  type Result,
  type RoomConfig,
  type RoomPhase,
  type RoomRulesetId,
  type RoomSnapshot,
  type RoomState,
  type Seat,
  type SeatView,
} from "./types";

/**
 * AUTHORITATIVE ROOM ENGINE — pure functions over RoomState.
 *
 * The server owns: the room seed, the ruleset, the current round, locked selections,
 * timing (last-seen) and the final validation. Scores are never accepted from clients:
 * they are recomputed by replaying the deterministic engine from
 * (engineVersion, seed, ruleset, selections).
 */

/** Presence thresholds. A short network blip never destroys a duel. */
export const CONNECTED_MS = 6_000;
export const RECONNECT_GRACE_MS = 60_000;

export function roomSeed(config: Pick<RoomConfig, "seedBase" | "generation">): string {
  return config.generation === 0 ? config.seedBase : seedFromLabel(`${config.seedBase}:run:${config.generation}`);
}

export function rulesetOf(config: Pick<RoomConfig, "rulesetId">) {
  return RULESETS[config.rulesetId];
}

export interface CreateParams {
  code: string;
  rulesetId: RoomRulesetId;
  formation: FormationId;
  engineVersion: string;
  seedBase: string;
  token: string;
  nickname: string;
  now: number;
}

export function createRoom(p: CreateParams): RoomState {
  const host: Seat = newSeat("s1", p.token, p.nickname, p.now);
  return {
    config: {
      code: p.code,
      rulesetId: p.rulesetId,
      formation: p.formation,
      engineVersion: p.engineVersion,
      seedBase: p.seedBase,
      generation: 0,
      createdAt: p.now,
      hostSeat: host.seatId,
    },
    seats: [host],
    version: 1,
  };
}

function newSeat(seatId: string, token: string, nickname: string, now: number): Seat {
  return { seatId, token, nickname, joinedAt: now, lastSeen: now, left: false, picks: [], lockedAt: [], rematch: false };
}

const bump = (s: RoomState, seats: Seat[], config = s.config): RoomState => ({ config, seats, version: s.version + 1 });

/** Join, or re-join with the same token (reconnect keeps the seat and every pick). */
export function joinRoom(state: RoomState, token: string, nickname: string, now: number): Result<{ state: RoomState; seatId: string }> {
  const existing = state.seats.find((s) => s.token === token);
  if (existing) {
    const seats = state.seats.map((s) => (s === existing ? { ...s, lastSeen: now, left: false, nickname: nickname || s.nickname } : s));
    return ok({ state: bump(state, seats), seatId: existing.seatId });
  }
  const max = rulesetOf(state.config).maxPlayers;
  if (state.seats.length >= max) return fail("room_full", "This room is full.");
  const seat = newSeat(`s${state.seats.length + 1}`, token, nickname || "Player", now);
  return ok({ state: bump(state, [...state.seats, seat]), seatId: seat.seatId });
}

export function phaseOf(state: RoomState): RoomPhase {
  const r = rulesetOf(state.config);
  if (r.multiplayerType === "duel" && state.seats.length < 2) return "waiting";
  const active = state.seats.filter((s) => !s.left || s.picks.length > 0);
  if (active.length > 0 && active.every((s) => s.picks.length >= ROUNDS)) return "completed";
  return "drafting";
}

/**
 * Shared Draft: in round r the seat at index r % 2 (join order) picks first, the other
 * picks second and cannot take the same player. Alternating first pick = snake order for two.
 */
export function firstPickerSeat<T>(seats: readonly T[], round: number): T | undefined {
  return seats[round % 2];
}

/** Lockstep: the round every participant is on (the slowest one's). */
export function openRound(state: RoomState): number {
  if (state.seats.length === 0) return 0;
  return Math.min(...state.seats.map((s) => s.picks.length));
}

/** Apply one client intent. Invalid intents are rejected with a reason; state is unchanged. */
export function applyIntent(state: RoomState, token: string, intent: Intent, now: number): Result<RoomState> {
  const seat = state.seats.find((s) => s.token === token);
  if (!seat) return fail("not_in_room", "Join the room first.");
  const r = rulesetOf(state.config);
  const replace = (next: Seat) => state.seats.map((s) => (s === seat ? next : s));

  switch (intent.type) {
    case "heartbeat":
      // Liveness only: no version bump (nothing others need to re-render).
      return ok({ ...state, seats: replace({ ...seat, lastSeen: now, left: false }) });

    case "leave":
      return ok(bump(state, replace({ ...seat, left: true, lastSeen: now })));

    case "rename":
      return ok(bump(state, replace({ ...seat, nickname: intent.nickname, lastSeen: now })));

    case "lock": {
      if (phaseOf(state) === "waiting") return fail("not_started", "Waiting for your opponent to join.");
      const round = intent.round;
      if (seat.picks.length >= ROUNDS) return fail("finished", "Your XI is already complete.");
      if (round !== seat.picks.length) return fail("out_of_turn", `Expected a pick for round ${seat.picks.length + 1}.`);
      if (r.roundSync === "lockstep" && round > openRound(state)) {
        return fail("out_of_turn", "Wait for everyone to lock the current round.");
      }
      if (!Number.isInteger(intent.optionIndex) || intent.optionIndex < 0 || intent.optionIndex >= r.choiceCount) {
        return fail("invalid_option", "That option does not exist.");
      }
      if (r.sharedPool) {
        const first = firstPickerSeat(state.seats, round);
        if (first && first !== seat) {
          const taken = first.picks[round];
          if (taken === undefined) return fail("out_of_turn", `${first.nickname} picks first this round.`);
          if (taken === intent.optionIndex) return fail("invalid_option", "Already taken.");
        }
      }
      const next = { ...seat, picks: [...seat.picks, intent.optionIndex], lockedAt: [...seat.lockedAt, now], lastSeen: now };
      return ok(bump(state, replace(next)));
    }

    case "rematch": {
      const seats = replace({ ...seat, rematch: true, lastSeen: now });
      const everyoneIn = seats.filter((s) => !s.left).every((s) => s.rematch);
      // The host starts a party's next run; if the host has gone, the longest-seated connected player inherits it.
      const host = state.seats.find((s) => s.seatId === state.config.hostSeat);
      const hostGone = !host || host.left || connectionOf(host, now) === "disconnected";
      const acting = hostGone ? state.seats.find((s) => !s.left && connectionOf(s, now) !== "disconnected") : host;
      const hostCalls = r.multiplayerType === "party" && seat.seatId === acting?.seatId;
      const finished = phaseOf(state) === "completed";
      if ((everyoneIn && finished) || hostCalls) {
        // Run it back: same room, same people, a new deterministic seed.
        const config = { ...state.config, generation: state.config.generation + 1 };
        const reset = seats.map((s) => ({ ...s, picks: [], lockedAt: [], rematch: false }));
        return ok(bump(state, reset, config));
      }
      return ok(bump(state, seats));
    }
  }
}

export function connectionOf(seat: Seat, now: number): ConnectionState {
  if (seat.left) return "disconnected";
  const age = now - seat.lastSeen;
  if (age < CONNECTED_MS) return "connected";
  if (age < RECONNECT_GRACE_MS) return "reconnecting";
  return "disconnected";
}

// ── verified results (memoised: replaying 11 picks + a season is cheap but not free) ──

const seasonCache = new Map<string, { draft: DraftState; result: SeasonResult }>();

export function seasonFor(config: RoomConfig, picks: readonly number[]): { draft: DraftState; result: SeasonResult } {
  return seasonForSeed(roomSeed(config), config.rulesetId, config.formation, config.engineVersion, picks);
}

export function seasonForSeed(
  seed: string,
  rulesetId: RoomRulesetId,
  formation: FormationId,
  engineVersion: string,
  picks: readonly number[],
): { draft: DraftState; result: SeasonResult } {
  const key = `${engineVersion}|${seed}|${rulesetId}|${formation}|${picks.join("")}`;
  const hit = seasonCache.get(key);
  if (hit) return hit;
  const draft = replayDraft({ seed, formation, mode: rulesetId, engineVersion }, picks, null);
  const value = { draft, result: runSeason(draft) };
  if (seasonCache.size > 500) seasonCache.clear();
  seasonCache.set(key, value);
  return value;
}

/** Server-style validation: does a claimed score match the replayed selections? */
export function verifyClaim(config: RoomConfig, picks: readonly number[], claimedPoints: number): boolean {
  if (picks.length !== ROUNDS) return false;
  try {
    return seasonFor(config, picks).result.points === claimedPoints;
  } catch {
    return false;
  }
}

/**
 * The viewer's snapshot. Other players' choices stay hidden until the viewer has
 * locked that round too (and, in lockstep rooms, until everyone has).
 */
export function snapshotFor(state: RoomState, viewerToken: string | null, now: number): RoomSnapshot {
  const r = rulesetOf(state.config);
  const viewer = viewerToken ? state.seats.find((s) => s.token === viewerToken) ?? null : null;
  const round = openRound(state);
  const lockstep = r.roundSync === "lockstep";
  const bothDone = (s: Seat) => s.picks.length >= ROUNDS;

  const seats: SeatView[] = state.seats.map((s) => {
    const you = s === viewer;
    const picks = s.picks.map((opt, i) => {
      if (you) return opt;
      if (r.sharedPool) return opt; // turn-based: a pick is public the moment it is made
      if (!viewer || viewer.picks.length <= i) return null;
      if (lockstep && round <= i) return null;
      return opt;
    });
    const completed = bothDone(s);
    const scoreVisible = completed && (r.multiplayerType === "party" || you || (viewer !== null && bothDone(viewer)));
    let score: number | null = null;
    if (scoreVisible) {
      try {
        score = seasonFor(state.config, s.picks).result.points;
      } catch {
        score = null;
      }
    }
    return {
      seatId: s.seatId,
      nickname: s.nickname,
      you,
      connection: connectionOf(s, now),
      progress: s.picks.length,
      picks,
      completed,
      score,
      rematch: s.rematch,
    };
  });

  return {
    code: state.config.code,
    rulesetId: state.config.rulesetId,
    formation: state.config.formation,
    engineVersion: state.config.engineVersion,
    seed: roomSeed(state.config),
    generation: state.config.generation,
    version: state.version,
    phase: phaseOf(state),
    round: lockstep ? round : -1,
    revealedThrough: round,
    maxPlayers: r.maxPlayers,
    hostSeat: state.config.hostSeat,
    you: viewer?.seatId ?? null,
    seats,
    serverTime: now,
  };
}
