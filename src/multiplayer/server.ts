import { ENGINE_VERSION, ROUNDS, freshSeed } from "@/engine";
import { CODE_RE, CreateRoomRequestSchema, IntentRequestSchema, JoinRequestSchema, sanitizeNickname } from "./protocol";
import { applyIntent, createRoom, joinRoom, phaseOf, seasonFor, snapshotFor } from "./roomEngine";
import { fail, ok, type Result, type RoomSnapshot, type RoomState } from "./types";

/**
 * RoomServer — the authoritative host. Framework-free: the Next.js route handlers,
 * the in-memory test transport and a future WebSocket/edge host all wrap this class.
 *
 * Prototype storage is in-process memory (single instance). Swap `rooms` for Redis or
 * Durable Objects without touching the protocol or the engine.
 */
export interface RoomServerOptions {
  now?: () => number;
  seed?: () => string;
  /** Rooms idle longer than this are removed. */
  ttlMs?: number;
  maxRooms?: number;
}

const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export interface VerifiedStanding {
  seatId: string;
  nickname: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalDiff: number;
}

export class RoomServer {
  private rooms = new Map<string, RoomState>();
  private listeners = new Map<string, Set<() => void>>();
  private now: () => number;
  private seed: () => string;
  private ttlMs: number;
  private maxRooms: number;

  constructor(opts: RoomServerOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.seed = opts.seed ?? freshSeed;
    this.ttlMs = opts.ttlMs ?? 3 * 60 * 60 * 1000;
    this.maxRooms = opts.maxRooms ?? 5_000;
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const s = this.seed();
      let code = "";
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[(s.charCodeAt(i % s.length) * 7 + attempt * 13 + i * 31) % CODE_ALPHABET.length];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Could not allocate a room code");
  }

  private emit(code: string) {
    for (const fn of this.listeners.get(code) ?? []) fn();
  }

  subscribe(code: string, fn: () => void): () => void {
    const set = this.listeners.get(code) ?? new Set();
    set.add(fn);
    this.listeners.set(code, set);
    return () => set.delete(fn);
  }

  create(raw: unknown): Result<RoomSnapshot> {
    const req = CreateRoomRequestSchema.safeParse(raw);
    if (!req.success) return fail("malformed", "Invalid create request.");
    this.sweep();
    if (this.rooms.size >= this.maxRooms) return fail("unavailable", "Too many rooms right now.");
    const code = this.newCode();
    const state = createRoom({
      code,
      rulesetId: req.data.rulesetId,
      formation: req.data.formation,
      engineVersion: ENGINE_VERSION,
      seedBase: this.seed(),
      token: req.data.token,
      nickname: sanitizeNickname(req.data.nickname),
      now: this.now(),
    });
    this.rooms.set(code, state);
    return ok(snapshotFor(state, req.data.token, this.now()));
  }

  join(code: string, raw: unknown): Result<RoomSnapshot> {
    if (!CODE_RE.test(code)) return fail("malformed", "Invalid room code.");
    const req = JoinRequestSchema.safeParse(raw);
    if (!req.success) return fail("malformed", "Invalid join request.");
    this.maybeSweep();
    const state = this.rooms.get(code);
    if (!state) return this.missing(code);
    const nick = req.data.nickname.trim() ? sanitizeNickname(req.data.nickname) : ""; // empty on rejoin = keep the seat's name
    const joined = joinRoom(state, req.data.token, nick, this.now());
    if (!joined.ok) return joined;
    this.rooms.set(code, joined.value.state);
    this.emit(code);
    return ok(snapshotFor(joined.value.state, req.data.token, this.now()));
  }

  intent(code: string, raw: unknown): Result<RoomSnapshot> {
    if (!CODE_RE.test(code)) return fail("malformed", "Invalid room code.");
    const req = IntentRequestSchema.safeParse(raw);
    if (!req.success) return fail("malformed", "Invalid intent.");
    const state = this.rooms.get(code);
    if (!state) return this.missing(code);
    const intent = req.data.intent.type === "rename" ? { type: "rename" as const, nickname: sanitizeNickname(req.data.intent.nickname) } : req.data.intent;
    const next = applyIntent(state, req.data.token, intent, this.now());
    if (!next.ok) return next;
    this.rooms.set(code, next.value);
    if (next.value.version !== state.version) this.emit(code);
    return ok(snapshotFor(next.value, req.data.token, this.now()));
  }

  /** Poll = heartbeat + snapshot (small; connection states are time-derived so it is always fresh). */
  poll(code: string, token: string): Result<RoomSnapshot> {
    if (!CODE_RE.test(code)) return fail("malformed", "Invalid room code.");
    this.maybeSweep();
    const state = this.rooms.get(code);
    if (!state) return this.missing(code);
    const hb = applyIntent(state, token, { type: "heartbeat" }, this.now());
    const current = hb.ok ? hb.value : state;
    this.rooms.set(code, current);
    return ok(snapshotFor(current, token, this.now()));
  }

  /** Final standings recomputed from selections — never from client-reported scores. */
  results(code: string): Result<VerifiedStanding[]> {
    const state = this.rooms.get(code);
    if (!state) return fail("not_found", "Room not found.");
    const standings: VerifiedStanding[] = [];
    for (const seat of state.seats) {
      if (seat.picks.length < ROUNDS) continue;
      const { result } = seasonFor(state.config, seat.picks);
      standings.push({
        seatId: seat.seatId,
        nickname: seat.nickname,
        points: result.points,
        wins: result.wins,
        draws: result.draws,
        losses: result.losses,
        goalDiff: result.goalsFor - result.goalsAgainst,
      });
    }
    standings.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.wins - a.wins);
    return ok(standings);
  }

  phase(code: string) {
    const s = this.rooms.get(code);
    return s ? phaseOf(s) : null;
  }

  /** Test/ops helper: raw state (never exposed over the network). */
  inspect(code: string): RoomState | undefined {
    return this.rooms.get(code);
  }

  /** Expired codes remembered for a while, so a late player is told "expired", not "never existed". */
  private tombstones = new Map<string, number>();
  private lastSweep = 0;

  private missing(code: string): Result<never> {
    return this.tombstones.has(code) ? fail("expired", "This room has expired.") : fail("not_found", "That room does not exist.");
  }

  /** Sweeps run on every request path (at most once a minute), not only when a room is created. */
  private maybeSweep() {
    if (this.now() - this.lastSweep >= 60_000) this.sweep();
  }

  sweep() {
    const now = this.now();
    this.lastSweep = now;
    const cutoff = now - this.ttlMs;
    for (const [code, s] of this.rooms) {
      const last = Math.max(s.config.createdAt, ...s.seats.map((x) => x.lastSeen));
      if (last < cutoff) {
        this.rooms.delete(code);
        this.listeners.delete(code);
        this.tombstones.set(code, now);
      }
    }
    for (const [code, at] of this.tombstones) if (now - at > this.ttlMs || this.rooms.has(code)) this.tombstones.delete(code);
    if (this.tombstones.size > 5000) this.tombstones.clear();
  }
}
