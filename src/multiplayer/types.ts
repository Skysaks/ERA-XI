import type { FormationId } from "@/types";

/**
 * Multiplayer domain types. Pure data — no React, no network. The same shapes are used
 * by the authoritative server, the in-memory test server and peer-to-peer transports.
 */

export type RoomRulesetId = "liveduel" | "party" | "shared";

export interface RoomConfig {
  /** Short, human-typable room code. */
  code: string;
  rulesetId: RoomRulesetId;
  formation: FormationId;
  engineVersion: string;
  /** Base seed. Generation n ("run it back") derives its own deterministic seed. */
  seedBase: string;
  generation: number;
  createdAt: number;
  hostSeat: string;
}

/** Private, server-side view of a participant. `token` never leaves the server. */
export interface Seat {
  seatId: string;
  token: string;
  nickname: string;
  joinedAt: number;
  lastSeen: number;
  left: boolean;
  /** Option index chosen in each round, in order. */
  picks: number[];
  lockedAt: number[];
  rematch: boolean;
}

export interface RoomState {
  config: RoomConfig;
  seats: Seat[];
  /** Increments on every accepted change (for cheap "anything new?" polling). */
  version: number;
}

export type Intent =
  | { type: "lock"; round: number; optionIndex: number }
  | { type: "heartbeat" }
  | { type: "leave" }
  | { type: "rematch" }
  | { type: "rename"; nickname: string };

export type ConnectionState = "connected" | "reconnecting" | "disconnected";
export type RoomPhase = "waiting" | "drafting" | "completed";

/** Public view of a seat, redacted for one viewer. */
export interface SeatView {
  seatId: string;
  nickname: string;
  you: boolean;
  connection: ConnectionState;
  /** Rounds locked so far. */
  progress: number;
  /** Per locked round: the option index, or null while it must stay hidden from this viewer. */
  picks: (number | null)[];
  completed: boolean;
  /** Server-verified season points, when visible to this viewer. */
  score: number | null;
  rematch: boolean;
}

export interface RoomSnapshot {
  code: string;
  rulesetId: RoomRulesetId;
  formation: FormationId;
  engineVersion: string;
  seed: string;
  generation: number;
  version: number;
  phase: RoomPhase;
  /** Lockstep rooms: the round open for everyone (0–11). Free rooms: -1. */
  round: number;
  /** Rounds every participant has locked (reveal boundary in lockstep rooms). */
  revealedThrough: number;
  maxPlayers: number;
  hostSeat: string;
  you: string | null;
  seats: SeatView[];
  serverTime: number;
}

export type RoomErrorCode =
  | "not_found"
  | "room_full"
  | "malformed"
  | "not_in_room"
  | "not_started"
  | "out_of_turn"
  | "invalid_option"
  | "finished"
  | "rate_limited"
  | "unavailable"
  /** The room existed but was cleaned up after inactivity. */
  | "expired"
  /** The room runs an engine this client cannot replay (an older cached app): reload. */
  | "version_mismatch";

export interface RoomError {
  code: RoomErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: RoomError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(code: RoomErrorCode, message: string): Result<T> => ({ ok: false, error: { code, message } });
