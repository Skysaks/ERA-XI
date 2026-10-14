import type { CreateRoomRequest, JoinRequest } from "./protocol";
import type { RoomServer } from "./server";
import { fail, type Intent, type Result, type RoomSnapshot } from "./types";
import type { RoomListener, RoomTransport, TransportStatus } from "./transport";

/**
 * In-process transport over a RoomServer. Used by tests and by "practice duels" against
 * the house bot (no backend needed). Can simulate latency and network drops.
 */
export class MemoryTransport implements RoomTransport {
  readonly kind = "memory" as const;
  private online = true;
  private statusListeners = new Set<(s: TransportStatus) => void>();

  constructor(
    private server: RoomServer,
    private opts: { latencyMs?: number; heartbeatMs?: number } = {},
  ) {}

  /** Simulate losing / regaining the network. */
  setOnline(online: boolean) {
    this.online = online;
    for (const fn of this.statusListeners) fn(online ? "online" : "reconnecting");
  }

  private async delay<T>(fn: () => Result<T>): Promise<Result<T>> {
    if (!this.online) return fail("unavailable", "Offline");
    const ms = this.opts.latencyMs ?? 0;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    if (!this.online) return fail("unavailable", "Offline");
    return fn();
  }

  create(req: CreateRoomRequest) {
    return this.delay(() => this.server.create(req));
  }

  join(code: string, req: JoinRequest) {
    return this.delay(() => this.server.join(code, req));
  }

  send(code: string, token: string, intent: Intent) {
    return this.delay(() => this.server.intent(code, { token, intent }));
  }

  watch(code: string, token: string, listener: RoomListener): () => void {
    let alive = true;
    const push = () => {
      if (!alive || !this.online) return;
      const r = this.server.poll(code, token);
      if (r.ok) listener.onSnapshot(r.value);
      else listener.onError?.(r.error);
    };
    const status = (s: TransportStatus) => {
      listener.onStatus?.(s);
      if (s === "online") push();
    };
    this.statusListeners.add(status);
    const unsub = this.server.subscribe(code, () => setTimeout(push, this.opts.latencyMs ?? 0));
    const timer = setInterval(push, this.opts.heartbeatMs ?? 1000);
    queueMicrotask(push);
    return () => {
      alive = false;
      unsub();
      clearInterval(timer);
      this.statusListeners.delete(status);
    };
  }
}

export type { RoomSnapshot };
