import { describe, expect, it } from "vitest";
import { ROUNDS } from "@/engine";
import {
  MemoryTransport,
  RoomClient,
  RoomServer,
  applyIntent,
  createRoom,
  duelPhase,
  joinRoom,
  roomView,
  type ClientState,
  type RoomSnapshot,
  type RoomTransport,
} from "@/multiplayer";
import { fail } from "@/multiplayer/types";

const T = (n: number) => `token-${String(n).padStart(12, "0")}`;
const until = async (cond: () => boolean, ms = 4000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe("V2.0 multiplayer: room lifecycle", () => {
  it("rooms expire after inactivity on ANY request path, and a late player is told 'expired', not 'not found'", () => {
    let now = 1_000_000;
    const server = new RoomServer({ now: () => now, ttlMs: 60 * 60 * 1000 });
    const created = server.create({ rulesetId: "liveduel", formation: "433", nickname: "Flo", token: T(1) });
    expect(created.ok).toBe(true);
    const code = created.ok ? created.value.code : "";
    now += 2 * 60 * 60 * 1000; // two hours later, nobody polled
    const late = server.join(code, { nickname: "Anthony", token: T(2) });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe("expired");
    const poll = server.poll(code, T(1));
    expect(!poll.ok && poll.error.code).toBe("expired");
    expect(!server.poll("zzzzz", T(1)).ok && (server.poll("zzzzz", T(1)) as { error: { code: string } }).error.code).toBe("not_found");
  });

  it("a party whose host left can still start the next run (host migration)", () => {
    let s = createRoom({ code: "abcde", rulesetId: "party", formation: "433", engineVersion: "7", seedBase: "hostmig", token: T(1), nickname: "Host", now: 0 });
    for (const n of [2, 3]) {
      const j = joinRoom(s, T(n), `P${n}`, 0);
      if (!j.ok) throw new Error(j.error.message);
      s = j.value.state;
    }
    const left = applyIntent(s, T(1), { type: "leave" }, 1000);
    if (!left.ok) throw new Error(left.error.message);
    const gen = left.value.config.generation;
    const r = applyIntent(left.value, T(2), { type: "rematch" }, 2000);
    expect(r.ok && r.value.config.generation).toBe(gen + 1);
  });
});

describe("V2.0 multiplayer: explicit duel state machine", () => {
  it("walks CREATING → WAITING → ROUND_ACTIVE → LOCAL/OPPONENT_LOCKED → COMPLETED → REMATCH_PENDING", async () => {
    const server = new RoomServer();
    const a = new RoomClient(new MemoryTransport(server, { latencyMs: 1, heartbeatMs: 20 }), { token: T(1), nickname: "Flo" }, { revealMs: 1 });
    const b = new RoomClient(new MemoryTransport(server, { latencyMs: 1, heartbeatMs: 20 }), { token: T(2), nickname: "Anthony" }, { revealMs: 1 });
    expect(duelPhase({ ...a.getState(), busy: true })).toBe("CREATING");
    await a.create("liveduel", "433");
    expect(duelPhase(a.getState())).toBe("WAITING_FOR_OPPONENT");
    await b.join(a.getState().code!);
    await until(() => a.getState().snapshot?.phase === "drafting");
    expect(duelPhase(a.getState())).toBe("ROUND_ACTIVE");
    // Identical offers: same seed, formation, engine for both seats.
    const sa = a.getState().snapshot!;
    const sb = b.getState().snapshot!;
    expect([sa.seed, sa.formation, sa.engineVersion]).toEqual([sb.seed, sb.formation, sb.engineVersion]);

    await a.lock(0);
    expect(duelPhase(a.getState())).toBe("LOCAL_LOCKED");
    await until(() => roomView(b.getState())!.status === "opponentReady");
    expect(duelPhase(b.getState())).toBe("OPPONENT_LOCKED");
    // Secrecy: B cannot see A's option before locking.
    expect(b.getState().snapshot!.seats.find((s) => !s.you)!.picks[0] ?? null).toBeNull();
    await b.lock(0); // the same player: allowed
    for (let r = 1; r < ROUNDS; r++) {
      await until(() => roomView(a.getState())!.myPicks.length === r && roomView(a.getState())!.status !== "locked" && roomView(a.getState())!.status !== "reveal");
      await a.lock(r % 4);
      await until(() => roomView(b.getState())!.myPicks.length === r && roomView(b.getState())!.status !== "locked" && roomView(b.getState())!.status !== "reveal");
      await b.lock((r + 1) % 4);
    }
    await until(() => a.getState().snapshot?.phase === "completed" && roomView(a.getState())!.status === "completed");
    expect(duelPhase(a.getState())).toBe("COMPLETED");
    await a.rematch();
    expect(duelPhase(a.getState())).toBe("REMATCH_PENDING");
    await b.rematch();
    await until(() => a.getState().snapshot?.generation === 1);
    expect(a.getState().snapshot!.seed).not.toBe(sa.seed); // fresh seed
    a.dispose();
    b.dispose();
  });

  it("network loss → RECONNECTING / DISCONNECTED; a room from a newer engine → CLOSED with version_mismatch", () => {
    const base: ClientState = { code: "abcde", snapshot: null, net: "online", pending: null, reveal: null, error: null, busy: false };
    expect(duelPhase(base)).toBe("CLOSED");
    const snap = { code: "abcde", engineVersion: "7", phase: "drafting", seats: [], round: 0, revealedThrough: 0, generation: 0, version: 1 } as unknown as RoomSnapshot;
    expect(duelPhase({ ...base, snapshot: snap, net: "reconnecting" })).toBe("RECONNECTING");
    expect(duelPhase({ ...base, snapshot: snap, net: "offline" })).toBe("DISCONNECTED");
    expect(duelPhase({ ...base, snapshot: snap, error: { code: "version_mismatch", message: "" } })).toBe("CLOSED");
  });

  it("the client refuses to play a room its engine cannot replay", async () => {
    const server = new RoomServer();
    const inner = new MemoryTransport(server, { latencyMs: 1 });
    const future: RoomTransport = {
      kind: "memory",
      create: async (req) => {
        const r = await inner.create(req);
        return r.ok ? { ok: true, value: { ...r.value, engineVersion: "99" } } : r;
      },
      join: (c, r) => inner.join(c, r),
      send: (c, t, i) => inner.send(c, t, i),
      watch: () => () => {},
    };
    const c = new RoomClient(future, { token: T(9), nickname: "Old app" });
    await c.create("liveduel", "433");
    expect(c.getState().error?.code).toBe("version_mismatch");
    expect(duelPhase(c.getState())).toBe("CLOSED");
    c.dispose();
  });
});

describe("V2.0 multiplayer: duplicate submissions", () => {
  it("a pick whose response was lost is retried without error and locked exactly once", async () => {
    const server = new RoomServer();
    const inner = new MemoryTransport(server, { latencyMs: 1, heartbeatMs: 20 });
    let dropNext = false;
    const flaky: RoomTransport = {
      kind: "memory",
      create: (r) => inner.create(r),
      join: (c, r) => inner.join(c, r),
      async send(c, t, i) {
        const r = await inner.send(c, t, i);
        if (dropNext && i.type === "lock") {
          dropNext = false;
          return fail("unavailable", "response lost"); // applied on the server, lost on the way back
        }
        return r;
      },
      watch: (c, t, l) => inner.watch(c, t, l),
    };
    const a = new RoomClient(flaky, { token: T(1), nickname: "Flo" }, { revealMs: 1 });
    const b = new RoomClient(new MemoryTransport(server, { latencyMs: 1, heartbeatMs: 20 }), { token: T(2), nickname: "Anthony" }, { revealMs: 1 });
    await a.create("liveduel", "433");
    await b.join(a.getState().code!);
    await until(() => a.getState().snapshot?.phase === "drafting");
    dropNext = true;
    await a.lock(2);
    await new Promise((r) => setTimeout(r, 1400)); // the automatic retry fires after 1.2 s
    expect(a.getState().error).toBeNull();
    await until(() => a.getState().snapshot!.seats.find((s) => s.you)!.progress === 1);
    const me = server.inspect(a.getState().code!)!.seats.find((s) => s.token === T(1))!;
    expect(me.picks).toEqual([2]);
    a.dispose();
    b.dispose();
  });
});
