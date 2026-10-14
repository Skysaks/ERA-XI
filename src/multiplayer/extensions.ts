/**
 * SOCIAL / CO-OP EXTENSION POINTS — types only (V1.4).
 *
 * The live room engine (roomEngine.ts) is seat-based: every seat drafts its own XI from
 * the same seeded offers, and the result layer (results.ts) ranks seats. The formats below
 * extend that model WITHOUT touching the Live Duel path:
 *
 *   Party 2–8        — shipped (multiplayerType "party", maxPlayers ≤ 8).
 *   2v2 Team XI      — seats grouped into teams; each team owns ONE lineup and seats take
 *                      alternate rounds (the Shared Draft turn logic, per team).
 *   Co-op XI         — all seats own one lineup together; a round resolves by vote or by a
 *                      rotating captain. Scored like a solo run, so it has no opponent.
 *   Creator Rooms    — a host publishes a room with custom rules (ERA+ custom_rulesets);
 *                      joining stays free (viral rule), capacity via `capacity`.
 *   Spectator        — read-only connection: receives snapshots with every seat's picks
 *                      hidden until each round's reveal, cannot send intents.
 *
 * Rule for implementers: a new format adds a `multiplayerType` and a result reducer; the
 * duel's lockstep commit–reveal and its 2-seat validation stay exactly as they are.
 */
export type FutureMultiplayerType = "team2v2" | "coop" | "creator";

export interface TeamAssignment {
  /** seatId → team index (0/1). Each team drafts one shared lineup. */
  teams: Record<string, 0 | 1>;
  /** Which seat of a team picks in a given round: alternate by default. */
  pickerFor(team: 0 | 1, round: number): string;
}

export interface CoopPolicy {
  kind: "captainRotation" | "majorityVote";
  /** Seconds before an undecided vote falls back to the captain's choice. */
  voteTimeoutS?: number;
}

export interface CreatorRoomConfig {
  /** Custom ruleset id (validated by validateRuleset before the room opens). */
  rulesetId: string;
  capacity: number; // 2–8 players, spectators excluded
  title: string;
  /** Joining is always free, whatever the creator's plan. */
  freeToJoin: true;
}

export type ConnectionRole = "player" | "spectator";

export interface SpectatorView {
  role: "spectator";
  /** Rounds whose picks are public (after reveal). Never the round in progress. */
  revealedRounds: number;
}
