import type { FormationId } from "@/types";
import { ROUNDS, SUPPORTED_ENGINE_VERSIONS } from "@/engine";
import type { RoomListener, RoomTransport, TransportStatus } from "./transport";
import type { RoomError, RoomRulesetId, RoomSnapshot, SeatView } from "./types";

/**
 * RoomClient — framework-free client state for Live Duel and Party rooms.
 * Holds the latest snapshot, an optimistic pending pick, and the short reveal window
 * ("YOU → MODRIĆ / ANTHONY → BENZEMA") that plays when every player has locked a round.
 * React (or React Native) subscribes; nothing here knows about components.
 */
export interface RevealEntry {
  seatId: string;
  nickname: string;
  you: boolean;
  optionIndex: number;
}

export interface ClientState {
  code: string | null;
  snapshot: RoomSnapshot | null;
  net: TransportStatus;
  pending: { round: number; optionIndex: number } | null;
  reveal: { round: number; entries: RevealEntry[] } | null;
  error: RoomError | null;
  busy: boolean;
  /** Diagnostics: consecutive failed network attempts (0 = healthy). */
  failures?: number;
}

export const REVEAL_MS = 1300;

export class RoomClient {
  private state: ClientState = { code: null, snapshot: null, net: "online", pending: null, reveal: null, error: null, busy: false, failures: 0 };
  private listeners = new Set<(s: ClientState) => void>();
  private unwatch: (() => void) | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRevealed = -1;
  private lastGeneration = -1;

  constructor(
    private transport: RoomTransport,
    private identity: { token: string; nickname: string },
    private opts: { revealMs?: number } = {},
  ) {}

  getState(): ClientState {
    return this.state;
  }

  subscribe(fn: (s: ClientState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private accept = (snap: RoomSnapshot) => {
    // A room created by a newer engine than this (cached) app can replay: say so, never guess.
    if (!SUPPORTED_ENGINE_VERSIONS.includes(snap.engineVersion)) {
      this.unwatch?.();
      this.unwatch = null;
      this.set({ error: { code: "version_mismatch", message: "This room needs the latest version of ERA XI. Reload to update." } });
      return;
    }
    const prev = this.state.snapshot;
    if (prev && prev.code === snap.code && prev.generation === snap.generation && snap.version < prev.version) return; // stale
    let pending = this.state.pending;
    const me = snap.seats.find((s) => s.you);
    if (pending && me && me.progress > pending.round) pending = null; // confirmed

    if (snap.generation !== this.lastGeneration) {
      this.lastGeneration = snap.generation;
      this.lastRevealed = snap.revealedThrough;
      this.set({ reveal: null });
    }
    const lockstep = snap.round >= 0;
    if (lockstep && snap.revealedThrough > this.lastRevealed) {
      const round = snap.revealedThrough - 1;
      const entries: RevealEntry[] = snap.seats
        .map((s) => ({ seatId: s.seatId, nickname: s.nickname, you: s.you, optionIndex: s.picks[round] ?? -1 }))
        .filter((e) => e.optionIndex >= 0);
      this.lastRevealed = snap.revealedThrough;
      if (entries.length === snap.seats.length && snap.seats.length > 1) {
        if (this.revealTimer) clearTimeout(this.revealTimer);
        this.set({ reveal: { round, entries } });
        this.revealTimer = setTimeout(() => this.set({ reveal: null }), this.opts.revealMs ?? REVEAL_MS);
      }
    }
    this.set({ snapshot: snap, code: snap.code, pending, error: null });
  };

  private listener: RoomListener = {
    onSnapshot: this.accept,
    onStatus: (net) => this.set({ net }),
    onAttempt: (failures) => {
      if (failures !== this.state.failures) this.set({ failures });
    },
    onError: (e) => this.set({ error: { code: e.code as RoomError["code"], message: e.message } }),
  };

  private startWatching(code: string) {
    this.unwatch?.();
    this.unwatch = this.transport.watch(code, this.identity.token, this.listener);
  }

  async create(rulesetId: RoomRulesetId, formation: FormationId): Promise<boolean> {
    this.set({ busy: true, error: null });
    const r = await this.transport.create({ rulesetId, formation, nickname: this.identity.nickname, token: this.identity.token });
    this.set({ busy: false });
    if (!r.ok) {
      this.set({ error: r.error });
      return false;
    }
    this.accept(r.value);
    this.startWatching(r.value.code);
    return true;
  }

  async join(code: string): Promise<boolean> {
    this.set({ busy: true, error: null });
    const r = await this.transport.join(code, { nickname: this.identity.nickname, token: this.identity.token });
    this.set({ busy: false });
    if (!r.ok) {
      this.set({ error: r.error });
      return false;
    }
    this.accept(r.value);
    this.startWatching(code);
    return true;
  }

  /** One tap = lock. Optimistic; rolled back if the server refuses. */
  async lock(optionIndex: number, retry = false): Promise<void> {
    const snap = this.state.snapshot;
    const me = snap?.seats.find((s) => s.you);
    if (!snap || !me || this.state.pending || me.progress >= ROUNDS) return;
    const round = me.progress;
    if (snap.round >= 0 && round > snap.revealedThrough) return; // lockstep: wait for the reveal
    const turn = sharedTurn(snap, round);
    if (turn && (turn.waiting || turn.taken === optionIndex)) return;
    this.set({ pending: { round, optionIndex } });
    const r = await this.transport.send(snap.code, this.identity.token, { type: "lock", round, optionIndex });
    if (r.ok) this.accept(r.value);
    else if (r.error.code === "unavailable") {
      // Keep the pick; retry until the network returns (a blip must not lose a pick).
      setTimeout(() => {
        if (this.state.pending?.round === round) {
          this.set({ pending: null });
          void this.lock(optionIndex, true);
        }
      }, 1200);
    } else if (retry && r.error.code === "out_of_turn") {
      // The first attempt did reach the server before the network dropped: the pick is already
      // locked (idempotent). Keep it on screen; the next snapshot confirms it — no error shown.
      return;
    } else this.set({ pending: null, error: r.error });
  }

  async rematch() {
    const snap = this.state.snapshot;
    if (!snap) return;
    const r = await this.transport.send(snap.code, this.identity.token, { type: "rematch" });
    if (r.ok) this.accept(r.value);
  }

  async leave() {
    const snap = this.state.snapshot;
    if (snap) await this.transport.send(snap.code, this.identity.token, { type: "leave" });
    this.dispose();
  }

  dispose() {
    this.unwatch?.();
    this.unwatch = null;
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.listeners.clear();
  }
}

export type DuelStatus = "waiting" | "choosing" | "opponentReady" | "theirTurn" | "locked" | "reveal" | "completed";

/**
 * Shared Draft turn for the viewer in `round`: null outside shared rooms.
 * waiting = the other player picks first and hasn't yet; taken = the option they took.
 */
export function sharedTurn(snap: RoomSnapshot, round: number): { first: SeatView; waiting: boolean; taken: number | null } | null {
  if (snap.rulesetId !== "shared") return null;
  const first = snap.seats[round % 2];
  if (!first) return null;
  if (first.you) return { first, waiting: false, taken: null };
  const taken = first.picks[round] ?? null;
  return { first, waiting: taken === null, taken };
}

export interface RoomView {
  status: DuelStatus;
  me: SeatView | null;
  others: SeatView[];
  /** My picks including an optimistic pending one. */
  myPicks: number[];
  /** Which round's offer to show. */
  displayRound: number;
  /** My choice in the displayed round, if already locked. */
  lockedOption: number | null;
  reconnecting: boolean;
}

/** Pure projection of client state into what the screen needs. */
export function roomView(s: ClientState): RoomView | null {
  const snap = s.snapshot;
  if (!snap) return null;
  const me = snap.seats.find((x) => x.you) ?? null;
  const others = snap.seats.filter((x) => !x.you);
  const confirmed = (me?.picks ?? []).map((p) => p ?? -1);
  const myPicks = s.pending && s.pending.round === confirmed.length ? [...confirmed, s.pending.optionIndex] : confirmed;
  const mine = myPicks.length;
  const reconnecting = s.net !== "online";
  const lockstep = snap.round >= 0;

  if (snap.phase === "waiting") return { status: "waiting", me, others, myPicks, displayRound: mine, lockedOption: null, reconnecting };
  if (s.reveal) {
    return { status: "reveal", me, others, myPicks, displayRound: s.reveal.round, lockedOption: myPicks[s.reveal.round] ?? null, reconnecting };
  }
  if (lockstep && mine > snap.revealedThrough) {
    return { status: "locked", me, others, myPicks, displayRound: mine - 1, lockedOption: myPicks[mine - 1] ?? null, reconnecting };
  }
  if (mine >= ROUNDS) return { status: "completed", me, others, myPicks, displayRound: ROUNDS - 1, lockedOption: myPicks[ROUNDS - 1] ?? null, reconnecting };
  const turn = sharedTurn(snap, mine);
  if (turn?.waiting) return { status: "theirTurn", me, others, myPicks, displayRound: mine, lockedOption: null, reconnecting };
  const opponentAhead = others.some((o) => o.progress > mine);
  return { status: opponentAhead ? "opponentReady" : "choosing", me, others, myPicks, displayRound: mine, lockedOption: null, reconnecting };
}

/**
 * DUEL STATE MACHINE — one explicit state for the whole screen, derived (never stored) from the
 * authoritative snapshot, the transport and the local optimistic pick, so impossible combinations
 * ("locked" while "waiting for opponent" while "disconnected") cannot exist.
 */
export type DuelPhase =
  | "CREATING"
  | "WAITING_FOR_OPPONENT"
  | "READY"
  | "ROUND_ACTIVE"
  | "LOCAL_LOCKED"
  | "OPPONENT_LOCKED"
  | "REVEAL"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "OPPONENT_DISCONNECTED"
  | "COMPLETED"
  | "REMATCH_PENDING"
  | "CLOSED";

export function duelPhase(s: ClientState): DuelPhase {
  if (s.error && (s.error.code === "expired" || s.error.code === "not_found" || s.error.code === "version_mismatch")) return "CLOSED";
  const snap = s.snapshot;
  if (!snap) return s.busy ? "CREATING" : "CLOSED";
  if (s.net === "offline") return "DISCONNECTED";
  if (s.net === "reconnecting") return "RECONNECTING";
  const view = roomView(s);
  if (!view) return "CLOSED";
  const others = view.others;
  if (view.status === "waiting") return others.length ? "READY" : "WAITING_FOR_OPPONENT";
  if (view.status === "reveal") return "REVEAL";
  const opponentGone = others.length > 0 && others.every((o) => o.connection === "disconnected");
  if (snap.phase === "completed" || view.status === "completed") {
    if (view.me?.rematch) return "REMATCH_PENDING";
    return "COMPLETED";
  }
  if (opponentGone) return "OPPONENT_DISCONNECTED";
  if (view.status === "locked") return "LOCAL_LOCKED";
  if (view.status === "opponentReady") return "OPPONENT_LOCKED";
  return "ROUND_ACTIVE";
}
