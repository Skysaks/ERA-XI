import * as z from "zod/mini";
import type { FormationId } from "@/types";
import { ENGINE_VERSION, ROUNDS, RULESETS, seedFromLabel } from "@/engine";
import { sha256Hex } from "./hash";
import { CODE_RE, sanitizeNickname, type CreateRoomRequest, type JoinRequest } from "./protocol";
import { RECONNECT_GRACE_MS, snapshotFor } from "./roomEngine";
import { fail, ok, type Intent, type Result, type RoomRulesetId, type RoomSnapshot, type RoomState, type Seat } from "./types";
import type { RoomListener, RoomTransport } from "./transport";

/**
 * PEER-TO-PEER TRANSPORT over a presence channel (the claude.ai artifact `room`
 * capability, or any equivalent: each participant publishes one small JSON object that
 * everyone connected receives, re-sent on reconnect, cleared on leave).
 *
 * There is no server here, so hidden picks use COMMIT–REVEAL: a pick is published as
 * sha256(code|seat|generation|round|option|salt); the option and salt are revealed only
 * once every other active player has committed that round. Each client derives the same
 * RoomState from everyone's presence and runs the same room engine, so all views agree.
 * Trust model: friendly play (a peer can always leave); ranked play needs the server.
 */

/** Minimal surface of the presence channel this transport needs. */
export interface PresenceChannel {
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly { peer: string; isMe: boolean; sameTab: boolean; presence: Readonly<Record<string, unknown>>; updatedAt: number }[];
  onPeers(handler: () => void, onError?: (e: { code: string; message: string }) => void): () => void;
}

/** Key/value storage for this device's own seat (so a reload re-joins the same seat). */
export interface SeatStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const Picked = z.tuple([z.int().check(z.gte(0), z.lte(4)), z.string().check(z.regex(/^[a-z0-9]{8,24}$/))]);
const PresenceSchema = z.object({
  v: z.literal(1),
  code: z.string().check(z.regex(CODE_RE)),
  rs: z.enum(["liveduel", "party", "shared"]),
  f: z.enum(["433", "4231", "442", "352", "343", "4312", "41212", "4321", "424", "4222", "3421", "532", "523"]),
  gen: z.int().check(z.gte(0), z.lte(999)),
  seat: z.string().check(z.regex(/^[a-z0-9]{8,24}$/)),
  nick: z.string().check(z.maxLength(16)),
  joinedAt: z.number(),
  commits: z.array(z.string().check(z.regex(/^[0-9a-f]{16}$/))).check(z.maxLength(11)),
  reveals: z.array(z.nullable(Picked)).check(z.maxLength(11)),
  rematch: z.boolean(),
});
type PeerPresence = z.infer<typeof PresenceSchema>;

interface LocalSeat {
  code: string;
  rs: RoomRulesetId;
  f: FormationId;
  gen: number;
  seat: string;
  token: string;
  nick: string;
  joinedAt: number;
  picks: number[];
  salts: string[];
  revealed: number;
  rematch: boolean;
}

export function commitmentOf(code: string, seat: string, gen: number, round: number, option: number, salt: string): string {
  return sha256Hex(`${code}|${seat}|${gen}|${round}|${option}|${salt}`).slice(0, 16);
}

const ALPHA = "abcdefghijkmnpqrstuvwxyz23456789";
function randomId(n: number, rand: () => number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHA[Math.floor(rand() * ALPHA.length)];
  return s;
}

function cryptoRandom(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
  return Math.random(); // salts/ids only — never gameplay randomness
}

export class PresenceTransport implements RoomTransport {
  readonly kind = "presence" as const;
  private me: LocalSeat | null = null;
  /** Last presence seen per seat (kept after a peer disconnects, for reconnect grace). */
  private seen = new Map<string, { p: PeerPresence; lastSeen: number; here: boolean }>();

  constructor(
    private channel: PresenceChannel,
    private store: SeatStore,
    private opts: { now?: () => number; rand?: () => number; findMs?: number } = {},
  ) {}

  private hints = new Map<string, { rs: RoomRulesetId; f: FormationId }>();

  /** A joiner learns the ruleset and formation from the link (no server to ask). */
  hint(code: string, rs: RoomRulesetId, f: FormationId) {
    this.hints.set(code, { rs, f });
  }

  private now() {
    return this.opts.now?.() ?? Date.now();
  }
  private rand() {
    return this.opts.rand?.() ?? cryptoRandom();
  }

  private save() {
    if (this.me) this.store.set(`eraxi:room:${this.me.code}`, JSON.stringify(this.me));
  }

  private load(code: string): LocalSeat | null {
    try {
      const raw = this.store.get(`eraxi:room:${code}`);
      return raw ? (JSON.parse(raw) as LocalSeat) : null;
    } catch {
      return null;
    }
  }

  private presenceOf(me: LocalSeat): PeerPresence {
    return {
      v: 1,
      code: me.code,
      rs: me.rs,
      f: me.f,
      gen: me.gen,
      seat: me.seat,
      nick: me.nick,
      joinedAt: me.joinedAt,
      commits: me.picks.map((opt, r) => commitmentOf(me.code, me.seat, me.gen, r, opt, me.salts[r]!)),
      reveals: me.picks.map((opt, r) => (r < me.revealed ? ([opt, me.salts[r]!] as [number, string]) : null)),
      rematch: me.rematch,
    };
  }

  private async publish() {
    if (!this.me) return;
    this.save();
    await this.channel.presence({ eraxi: this.presenceOf(this.me) });
  }

  /** Read everyone's presence for this room, validate it, remember it. */
  private refreshPeers() {
    const now = this.now();
    for (const v of this.seen.values()) v.here = false;
    for (const peer of this.channel.peers()) {
      if (peer.isMe && peer.sameTab) continue;
      const parsed = PresenceSchema.safeParse(peer.presence?.eraxi);
      if (!parsed.success || !this.me || parsed.data.code !== this.me.code) continue;
      const p = parsed.data;
      if (p.seat === this.me.seat) continue; // our own other tab
      this.seen.set(p.seat, { p, lastSeen: now, here: true });
    }
    for (const [k, v] of this.seen) if (!v.here && now - v.lastSeen > RECONNECT_GRACE_MS * 10) this.seen.delete(k);
  }

  /** Verified picks of a peer for the current generation (stops at the first bad reveal). */
  private verified(p: PeerPresence): { committed: number; revealed: number[] } {
    if (!this.me || p.gen !== this.me.gen) return { committed: 0, revealed: [] };
    const revealed: number[] = [];
    for (let r = 0; r < p.commits.length; r++) {
      const rv = p.reveals[r];
      if (!rv) break;
      if (commitmentOf(p.code, p.seat, p.gen, r, rv[0], rv[1]) !== p.commits[r]) break;
      revealed.push(rv[0]);
    }
    return { committed: p.commits.length, revealed };
  }

  /** Build the shared RoomState every client derives identically. */
  private derive(): { state: RoomState; hidden: Map<string, number> } | null {
    const me = this.me;
    if (!me) return null;
    const now = this.now();
    const others = [...this.seen.values()].filter((x) => Math.abs(x.p.gen - me.gen) <= 1);
    type Row = { seat: string; token: string; nick: string; joinedAt: number; lastSeen: number; committed: number; revealed: number[]; rematch: boolean; here: boolean };
    const rows: Row[] = [
      { seat: me.seat, token: me.token, nick: me.nick, joinedAt: me.joinedAt, lastSeen: now, committed: me.picks.length, revealed: me.picks, rematch: me.rematch, here: true },
      ...others.map(({ p, lastSeen, here }) => {
        const v = this.verified(p);
        return { seat: p.seat, token: `peer:${p.seat}`, nick: sanitizeNickname(p.nick), joinedAt: p.joinedAt, lastSeen, committed: v.committed, revealed: v.revealed, rematch: p.rematch, here };
      }),
    ];
    rows.sort((a, b) => a.joinedAt - b.joinedAt || a.seat.localeCompare(b.seat));
    const max = RULESETS[me.rs].maxPlayers;
    const seated = rows.slice(0, max);
    const hidden = new Map<string, number>();
    const seats: Seat[] = seated.map((r) => {
      // Committed-but-unrevealed rounds count as locked; their value stays unknown (placeholder 0).
      const picks = [...r.revealed, ...new Array<number>(Math.max(0, r.committed - r.revealed.length)).fill(0)];
      hidden.set(r.seat, r.revealed.length);
      return { seatId: r.seat, token: r.token, nickname: r.nick, joinedAt: r.joinedAt, lastSeen: r.lastSeen, left: false, picks, lockedAt: picks.map(() => now), rematch: r.rematch };
    });
    const host = seats[0]?.seatId ?? me.seat;
    return {
      state: {
        config: { code: me.code, rulesetId: me.rs, formation: me.f, engineVersion: ENGINE_VERSION, seedBase: seedFromLabel(`room:${me.code}`), generation: me.gen, createdAt: me.joinedAt, hostSeat: host },
        seats,
        version: 0,
      },
      hidden,
    };
  }

  private snapshot(): RoomSnapshot | null {
    const d = this.derive();
    if (!d || !this.me) return null;
    const snap = snapshotFor(d.state, this.me.token, this.now());
    // Mask anything not yet cryptographically revealed; revealedThrough follows real reveals.
    const seats = snap.seats.map((s) => {
      const known = d.hidden.get(s.seatId) ?? 0;
      if (s.you) return s;
      return { ...s, picks: s.picks.map((p, i) => (i < known ? p : null)), score: known >= ROUNDS ? s.score : null };
    });
    const revealedThrough = Math.min(...d.state.seats.map((s) => (s.seatId === this.me!.seat ? this.me!.revealed : d.hidden.get(s.seatId) ?? 0)));
    const version = seats.reduce((a, s) => a + s.progress * 13 + s.picks.filter((p) => p !== null).length, snap.generation * 1000);
    return { ...snap, seats, revealedThrough: Math.min(revealedThrough, snap.revealedThrough), version };
  }

  /** Reveal my committed picks once every active opponent has committed the same round. */
  private autoReveal(): boolean {
    const d = this.derive();
    const me = this.me;
    if (!d || !me) return false;
    const now = this.now();
    let target = me.picks.length;
    for (const s of d.state.seats) {
      if (s.seatId === me.seat) continue;
      const entry = this.seen.get(s.seatId);
      const active = entry && (entry.here || now - entry.lastSeen < RECONNECT_GRACE_MS);
      if (active) target = Math.min(target, s.picks.length);
    }
    if (d.state.seats.length < 2 && RULESETS[me.rs].multiplayerType === "duel") target = 0;
    if (RULESETS[me.rs].sharedPool) target = me.picks.length;
    if (target > me.revealed) {
      me.revealed = target;
      return true;
    }
    return false;
  }

  /** Everyone voted for a rematch after finishing → move to the next generation together. */
  private autoRematch(): boolean {
    const me = this.me;
    const d = this.derive();
    if (!me || !d) return false;
    const everyone = d.state.seats;
    const done = everyone.every((s) => s.picks.length >= ROUNDS);
    const ahead = [...this.seen.values()].some((x) => x.p.gen === me.gen + 1);
    const hostCalls = me.rs === "party" && me.rematch && me.seat === d.state.config.hostSeat;
    if ((me.rematch && done && everyone.every((s) => s.rematch)) || ahead || hostCalls) {
      me.gen += 1;
      me.picks = [];
      me.salts = [];
      me.revealed = 0;
      me.rematch = false;
      return true;
    }
    return false;
  }

  async create(req: CreateRoomRequest): Promise<Result<RoomSnapshot>> {
    const code = randomId(5, () => this.rand());
    return this.enter(code, req.rulesetId, req.formation, req.nickname, req.token);
  }

  /**
   * Join by code alone: the ruleset and formation are read from whoever is already in the
   * room (a presence room exists only while someone is in it). Peers arrive over the first
   * second or two, so wait briefly before concluding the room is empty.
   */
  async join(code: string, req: JoinRequest): Promise<Result<RoomSnapshot>> {
    if (!CODE_RE.test(code)) return fail("malformed", "Invalid room code.");
    const saved = this.load(code);
    const known = this.hints.get(code) ?? (saved ? { rs: saved.rs, f: saved.f } : null) ?? (await this.findRoom(code, this.opts.findMs ?? 3500));
    if (!known) return fail("not_found", "Nobody is in that room right now.");
    return this.enter(code, known.rs, known.f, req.nickname, req.token);
  }

  private async findRoom(code: string, waitMs: number): Promise<{ rs: RoomRulesetId; f: FormationId } | null> {
    const deadline = this.now() + waitMs;
    for (;;) {
      for (const peer of this.channel.peers()) {
        const parsed = PresenceSchema.safeParse(peer.presence?.eraxi);
        if (parsed.success && parsed.data.code === code) return { rs: parsed.data.rs, f: parsed.data.f };
      }
      if (this.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  private async enter(code: string, rs: RoomRulesetId, f: FormationId, nickname: string, token: string): Promise<Result<RoomSnapshot>> {
    const saved = this.load(code);
    this.me = saved ?? {
      code,
      rs,
      f,
      gen: 0,
      seat: randomId(12, () => this.rand()),
      token,
      nick: sanitizeNickname(nickname),
      joinedAt: this.now(),
      picks: [],
      salts: [],
      revealed: 0,
      rematch: false,
    };
    if (nickname.trim()) this.me.nick = sanitizeNickname(nickname); // a rejoin without a name keeps the seat's name
    this.refreshPeers();
    const full = this.derive()?.state.seats.every((s) => s.seatId !== this.me!.seat);
    if (full) {
      this.me = null;
      return fail("room_full", "This room is full.");
    }
    try {
      await this.publish();
    } catch {
      return fail("unavailable", "Live rooms are unavailable here.");
    }
    const snap = this.snapshot();
    return snap ? ok(snap) : fail("unavailable", "Room unavailable.");
  }

  async send(_code: string, _token: string, intent: Intent): Promise<Result<RoomSnapshot>> {
    const me = this.me;
    if (!me) return fail("not_in_room", "Join the room first.");
    this.refreshPeers();
    const d = this.derive()!;
    const snap = this.snapshot()!;
    if (intent.type === "lock") {
      if (snap.phase === "waiting") return fail("not_started", "Waiting for your opponent to join.");
      if (intent.round !== me.picks.length || me.picks.length >= ROUNDS) return fail("out_of_turn", "Not your turn.");
      if (RULESETS[me.rs].roundSync === "lockstep" && intent.round > Math.min(...d.state.seats.map((s) => s.picks.length))) {
        return fail("out_of_turn", "Wait for everyone to lock the current round.");
      }
      if (intent.optionIndex < 0 || intent.optionIndex >= RULESETS[me.rs].choiceCount) return fail("invalid_option", "That option does not exist.");
      if (RULESETS[me.rs].sharedPool) {
        // Turn-based pool: the first picker's choice must already be public, and can't be taken twice.
        const first = d.state.seats[intent.round % 2];
        if (first && first.seatId !== me.seat) {
          const known = d.hidden.get(first.seatId) ?? 0;
          if (known <= intent.round) return fail("out_of_turn", `${first.nickname} picks first this round.`);
          if (first.picks[intent.round] === intent.optionIndex) return fail("invalid_option", "Already taken.");
        }
      }
      me.picks.push(intent.optionIndex);
      me.salts.push(randomId(12, () => this.rand()));
      if (RULESETS[me.rs].sharedPool) me.revealed = me.picks.length; // nothing to hide in a shared draft
      else this.autoReveal();
    } else if (intent.type === "rematch") {
      me.rematch = true;
      this.autoRematch();
    } else if (intent.type === "leave") {
      try {
        await this.channel.presence({ eraxi: null });
      } catch {
        /* ignore */
      }
      this.me = null;
      return fail("not_in_room", "Left the room.");
    } else if (intent.type === "rename") {
      me.nick = sanitizeNickname(intent.nickname);
    }
    try {
      await this.publish();
    } catch {
      return fail("unavailable", "Connection lost.");
    }
    return ok(this.snapshot()!);
  }

  watch(_code: string, _token: string, listener: RoomListener): () => void {
    let alive = true;
    const update = () => {
      if (!alive || !this.me) return;
      this.refreshPeers();
      const changed = this.autoRematch() || this.autoReveal();
      if (changed) void this.publish();
      const snap = this.snapshot();
      if (snap) listener.onSnapshot(snap);
    };
    const unsub = this.channel.onPeers(update, (e) => {
      listener.onStatus?.("offline");
      listener.onError?.(e);
    });
    // Connection states are time-based: re-derive periodically even when nobody changes.
    const timer = setInterval(update, 2000);
    queueMicrotask(update);
    return () => {
      alive = false;
      unsub();
      clearInterval(timer);
    };
  }
}
