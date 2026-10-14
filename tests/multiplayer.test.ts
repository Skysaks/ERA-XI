import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  LIVE_RULESETS,
  RULESETS,
  RULESET_IDS,
  ROUNDS,
  createDraft,
  currentOffer,
  drawRulesOf,
  generateDraw,
  validateRuleset,
  type GameRuleset,
} from "@/engine";
import {
  CONNECTED_MS,
  MemoryTransport,
  RECONNECT_GRACE_MS,
  RoomClient,
  RoomServer,
  applyIntent,
  createRoom,
  duelOutcome,
  joinRoom,
  parseIntent,
  parseSnapshot,
  roomSeed,
  roomView,
  seasonFor,
  snapshotFor,
  standings,
  startBot,
  verifyClaim,
  type RoomState,
} from "@/multiplayer";

const T = (n: number) => `token-${String(n).padStart(12, "0")}`;
const base = (code = "abcde", rulesetId: "liveduel" | "party" = "liveduel"): RoomState =>
  createRoom({ code, rulesetId, formation: "433", engineVersion: ENGINE_VERSION, seedBase: "roomseed1", token: T(1), nickname: "Florian", now: 0 });

function must<T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  return r.value;
}
const lock = (s: RoomState, tok: string, round: number, optionIndex: number, now = 1000) => applyIntent(s, tok, { type: "lock", round, optionIndex }, now);

describe("ruleset engine", () => {
  it("every configured ruleset validates (live and prepared)", () => {
    for (const id of RULESET_IDS) expect(validateRuleset(RULESETS[id]), id).toEqual([]);
  });

  it("rejects contradictory rulesets", () => {
    const bad: Partial<GameRuleset>[] = [
      { multiplayerType: "duel", maxPlayers: 3 },
      { multiplayerType: "duel", maxPlayers: 2, sameSeed: "challenge" },
      { multiplayerType: "party", maxPlayers: 4, sameSeed: "room", rerolls: 1 },
      { ranked: true, sameSeed: "challenge" },
      { choiceCount: 7 as never },
      { pickTimer: 2 },
      { status: "live", requires: ["pool:tag:time-travel"] },
      { positionTargets: true, rerolls: 1 },
      { playerChoice: "club" },
      { championsOnly: true, playerPool: "nation" },
    ];
    for (const b of bad) expect(validateRuleset({ ...RULESETS.classic, ...b }).length, JSON.stringify(b)).toBeGreaterThan(0);
    expect(validateRuleset({ id: 42 }).length).toBeGreaterThan(0);
  });

  it("Classic and Football IQ share the same draft, only visibility differs", () => {
    expect(drawRulesOf(RULESETS.classic)).toEqual(drawRulesOf(RULESETS.iq));
    expect(RULESETS.classic.ratingsVisible).toBe(true);
    expect(RULESETS.iq.ratingsVisible).toBe(false);
    const a = createDraft({ seed: "same1234", formation: "433", mode: "classic", engineVersion: ENGINE_VERSION });
    const b = createDraft({ seed: "same1234", formation: "433", mode: "iq", engineVersion: ENGINE_VERSION });
    expect(a.draw).toEqual(b.draw);
  });

  it("generation is deterministic per ruleset and honours choiceCount and era filters", () => {
    for (const id of LIVE_RULESETS) {
      const r = drawRulesOf(RULESETS[id]);
      expect(generateDraw("detseed1", ENGINE_VERSION, r, { formation: "433" })).toEqual(generateDraw("detseed1", ENGINE_VERSION, r, { formation: "433" }));
    }
    for (const n of [3, 5] as const) {
      const d = generateDraw("choices1", ENGINE_VERSION, { ...drawRulesOf(RULESETS.classic), choiceCount: n });
      for (const o of [...d.rounds, d.reserve]) expect(o.options).toHaveLength(n);
    }
    const nineties = generateDraw("buckets1", ENGINE_VERSION, { ...drawRulesOf(RULESETS.classic), eraFilter: { kind: "buckets", buckets: ["1990s", "2000s"] } });
    expect(nineties.rounds).toHaveLength(ROUNDS);
  });
});

describe("room engine — duel", () => {
  it("both players get the identical seed, offers and formation", () => {
    const s = must(joinRoom(base(), T(2), "Anthony", 10)).state;
    const a = snapshotFor(s, T(1), 20);
    const b = snapshotFor(s, T(2), 20);
    expect(a.seed).toBe(b.seed);
    expect(a.formation).toBe(b.formation);
    const da = createDraft({ seed: a.seed, formation: a.formation, mode: a.rulesetId, engineVersion: a.engineVersion });
    const db = createDraft({ seed: b.seed, formation: b.formation, mode: b.rulesetId, engineVersion: b.engineVersion });
    expect(da.draw).toEqual(db.draw);
    expect(currentOffer(da)).toEqual(currentOffer(db));
  });

  it("waits for the opponent before any pick", () => {
    expect(lock(base(), T(1), 0, 0).ok).toBe(false);
  });

  it("selections are independent, and both may take the same player", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 10)).state;
    s = must(lock(s, T(1), 0, 2));
    s = must(lock(s, T(2), 0, 2)); // same player — allowed, no first-click advantage
    s = must(lock(s, T(1), 1, 0));
    s = must(lock(s, T(2), 1, 3));
    expect(s.seats[0]?.picks).toEqual([2, 0]);
    expect(s.seats[1]?.picks).toEqual([2, 3]);
  });

  it("round synchronisation: nobody runs ahead of the open round", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 10)).state;
    s = must(lock(s, T(1), 0, 1));
    const ahead = lock(s, T(1), 1, 1);
    expect(ahead.ok).toBe(false);
    if (!ahead.ok) expect(ahead.error.code).toBe("out_of_turn");
    expect(lock(s, T(2), 1, 0).ok).toBe(false); // skipping a round
    expect(lock(s, T(2), 0, 9).ok).toBe(false); // option out of range
    s = must(lock(s, T(2), 0, 0));
    expect(snapshotFor(s, T(1), 1000).round).toBe(1);
  });

  it("the opponent's choice stays hidden until both have locked the round", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 10)).state;
    s = must(lock(s, T(2), 0, 3));
    const beforeMe = snapshotFor(s, T(1), 1000);
    expect(beforeMe.seats.find((x) => !x.you)?.picks).toEqual([null]); // locked, but hidden
    expect(beforeMe.seats.find((x) => !x.you)?.progress).toBe(1);
    s = must(lock(s, T(1), 0, 1));
    const after = snapshotFor(s, T(1), 1000);
    expect(after.seats.find((x) => !x.you)?.picks).toEqual([3]);
    expect(after.revealedThrough).toBe(1);
  });

  it("a third player cannot join a duel", () => {
    const s = must(joinRoom(base(), T(2), "Anthony", 10)).state;
    const r = joinRoom(s, T(3), "Late", 20);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("room_full");
  });

  it("reconnect keeps the seat and every pick; the duel survives the gap", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 0)).state;
    s = must(lock(s, T(1), 0, 1, 100));
    s = must(lock(s, T(2), 0, 2, 100));
    const opp = (now: number) => snapshotFor(s, T(1), now).seats.find((x) => !x.you)?.connection;
    expect(opp(100 + CONNECTED_MS - 1)).toBe("connected");
    expect(opp(100 + CONNECTED_MS + 1)).toBe("reconnecting");
    expect(opp(100 + RECONNECT_GRACE_MS + 1)).toBe("disconnected");
    // Comes back much later with the same token: same seat, same picks, can continue.
    const back = must(joinRoom(s, T(2), "Anthony", 200_000));
    expect(back.seatId).toBe("s2");
    s = back.state;
    expect(s.seats).toHaveLength(2);
    expect(s.seats[1]?.picks).toEqual([2]);
    expect(snapshotFor(s, T(1), 200_001).seats.find((x) => !x.you)?.connection).toBe("connected");
    expect(lock(s, T(2), 1, 0, 200_002).ok).toBe(true);
  });

  it("scores are recomputed from selections (server-style validation)", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 0)).state;
    for (let r = 0; r < ROUNDS; r++) {
      s = must(lock(s, T(1), r, r % 4));
      s = must(lock(s, T(2), r, (r + 1) % 4));
    }
    const a = seasonFor(s.config, s.seats[0]!.picks).result.points;
    expect(verifyClaim(s.config, s.seats[0]!.picks, a)).toBe(true);
    expect(verifyClaim(s.config, s.seats[0]!.picks, Math.min(114, a + 1))).toBe(false);
    expect(verifyClaim(s.config, s.seats[0]!.picks.slice(0, 10), a)).toBe(false);
    const snap = snapshotFor(s, T(1), 5000);
    expect(snap.phase).toBe("completed");
    expect(snap.seats.find((x) => x.you)?.score).toBe(a);
  });

  it("duel outcome: points first, the direct match only breaks ties; 2–4 deciding picks", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 0)).state;
    for (let r = 0; r < ROUNDS; r++) {
      s = must(lock(s, T(1), r, 0));
      s = must(lock(s, T(2), r, r % 2 === 0 ? 1 : 0));
    }
    const o = duelOutcome(snapshotFor(s, T(1), 5000))!;
    const mirror = duelOutcome(snapshotFor(s, T(2), 5000))!;
    expect(o.you.result.points).toBe(mirror.opponent.result.points);
    expect(o.headToHead.you).toBe(mirror.headToHead.opponent); // both see the same match
    if (o.you.result.points !== o.opponent.result.points) {
      expect(o.decidedBy).toBe("points");
      expect(o.winner).toBe(o.you.result.points > o.opponent.result.points ? "you" : "opponent");
    }
    expect(o.winner === "you").toBe(mirror.winner === "opponent");
    expect(o.comparison.differences.length).toBeGreaterThanOrEqual(1);
    expect(o.comparison.differences.length).toBeLessThanOrEqual(4);
    for (const d of o.comparison.differences) {
      expect(d.impact).not.toBeNull();
      expect(d.summary).toMatch(/over/);
    }
  });

  it("identical drafts tie on points and are settled by the direct match", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 0)).state;
    for (let r = 0; r < ROUNDS; r++) {
      s = must(lock(s, T(1), r, 1));
      s = must(lock(s, T(2), r, 1));
    }
    const o = duelOutcome(snapshotFor(s, T(1), 5000))!;
    expect(o.decidedBy).toBe("head_to_head");
    const h = o.headToHead;
    if (h.penalties) {
      expect(h.you).toBe(h.opponent);
      expect(h.winner).toBe(h.penalties[0] > h.penalties[1] ? "you" : "opponent");
    } else expect(h.winner).toBe(h.you > h.opponent ? "you" : "opponent");
    expect(o.winner).toBe(h.winner);
    expect(o.comparison.differences).toHaveLength(0);
  });

  it("rematch needs both votes and brings a new deterministic seed", () => {
    let s = must(joinRoom(base(), T(2), "Anthony", 0)).state;
    for (let r = 0; r < ROUNDS; r++) {
      s = must(lock(s, T(1), r, 0));
      s = must(lock(s, T(2), r, 0));
    }
    const seed0 = roomSeed(s.config);
    s = must(applyIntent(s, T(1), { type: "rematch" }, 6000));
    expect(s.config.generation).toBe(0);
    s = must(applyIntent(s, T(2), { type: "rematch" }, 6001));
    expect(s.config.generation).toBe(1);
    expect(roomSeed(s.config)).not.toBe(seed0);
    expect(roomSeed(s.config)).toBe(roomSeed({ seedBase: "roomseed1", generation: 1 }));
    expect(s.seats.every((x) => x.picks.length === 0)).toBe(true);
  });
});

describe("room engine — party", () => {
  it("free sync: fast players never wait; ranking uses verified scores; host runs it back", () => {
    let s = base("party", "party");
    for (let i = 2; i <= 4; i++) s = must(joinRoom(s, T(i), `P${i}`, 0)).state;
    // Player 1 finishes alone while others have barely started.
    for (let r = 0; r < ROUNDS; r++) s = must(lock(s, T(1), r, r % 4));
    s = must(lock(s, T(2), 0, 1));
    const snap = snapshotFor(s, T(2), 100);
    expect(snap.round).toBe(-1);
    expect(snap.phase).toBe("drafting");
    const table = standings(snap);
    expect(table[0]?.nickname).toBe("Florian");
    expect(table[0]?.points).not.toBeNull();
    // P2 cannot see Florian's later choices before locking those rounds.
    expect(snap.seats.find((x) => x.nickname === "Florian")?.picks.slice(1).every((p) => p === null)).toBe(true);
    // Host runs it back for everyone.
    const g = must(applyIntent(s, T(1), { type: "rematch" }, 200));
    expect(g.config.generation).toBe(1);
  });

  it("holds up to 8 players", () => {
    let s = base("party", "party");
    for (let i = 2; i <= 8; i++) s = must(joinRoom(s, T(i), `P${i}`, 0)).state;
    expect(joinRoom(s, T(9), "P9", 0).ok).toBe(false);
  });
});

describe("protocol + server", () => {
  it("rejects malformed payloads everywhere", () => {
    const server = new RoomServer({ seed: () => "serverseed1" });
    expect(server.create({}).ok).toBe(false);
    expect(server.create({ rulesetId: "liveduel", formation: "433", nickname: "x", token: "short" }).ok).toBe(false);
    expect(server.create({ rulesetId: "hacker", formation: "433", nickname: "x", token: T(1) }).ok).toBe(false);
    const created = must(server.create({ rulesetId: "liveduel", formation: "433", nickname: "<script>", token: T(1) }));
    expect(created.seats[0]?.nickname).toBe("Player"); // unsafe nickname replaced
    expect(server.join("ZZZZZ", { nickname: "a", token: T(2) }).ok).toBe(false);
    expect(server.join(created.code, { nickname: "a", token: T(2), extra: 1 }).ok).toBe(false);
    expect(server.intent(created.code, { token: T(1), intent: { type: "lock", round: 0, optionIndex: -1 } }).ok).toBe(false);
    expect(server.intent(created.code, { token: T(1), intent: { type: "explode" } }).ok).toBe(false);
    expect(server.intent(created.code, { token: T(9), intent: { type: "heartbeat" } }).ok).toBe(false);
    expect(parseIntent({ type: "lock", round: 11, optionIndex: 0 })).toBeNull();
    expect(parseSnapshot({ code: "abcde" })).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot(created)).not.toBeNull();
  });

  it("server results match what each client computes", () => {
    const server = new RoomServer({ seed: () => "serverseed2" });
    const a = must(server.create({ rulesetId: "liveduel", formation: "4231", nickname: "Florian", token: T(1) }));
    must(server.join(a.code, { nickname: "Anthony", token: T(2) }));
    for (let r = 0; r < ROUNDS; r++) {
      must(server.intent(a.code, { token: T(1), intent: { type: "lock", round: r, optionIndex: r % 3 } }));
      must(server.intent(a.code, { token: T(2), intent: { type: "lock", round: r, optionIndex: 3 - (r % 3) } }));
    }
    const verified = must(server.results(a.code));
    const client = duelOutcome(must(server.poll(a.code, T(1))))!;
    expect(verified.find((x) => x.nickname === "Florian")?.points).toBe(client.you.result.points);
    expect(verified.find((x) => x.nickname === "Anthony")?.points).toBe(client.opponent.result.points);
  });
});

describe("client over a transport", () => {
  const until = async (cond: () => boolean, ms = 8000) => {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error("timeout");
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  it("plays a full practice duel against the bot, surviving a network drop", async () => {
    const server = new RoomServer();
    const net = new MemoryTransport(server, { latencyMs: 2, heartbeatMs: 50 });
    const me = new RoomClient(net, { token: T(1), nickname: "Florian" }, { revealMs: 5 });
    expect(await me.create("liveduel", "433")).toBe(true);
    const code = me.getState().snapshot!.code;
    const bot = startBot(new MemoryTransport(server, { latencyMs: 2, heartbeatMs: 50 }), code, { token: T(2), nickname: "ERA Bot", thinkMs: [0, 5] });
    await until(() => me.getState().snapshot?.phase === "drafting");

    let dropped = false;
    while (roomView(me.getState())!.myPicks.length < ROUNDS) {
      const v = roomView(me.getState())!;
      if (v.status === "choosing" || v.status === "opponentReady") {
        if (v.myPicks.length === 5 && !dropped) {
          dropped = true;
          net.setOnline(false);
          void me.lock(1); // pick during the outage: must survive
          await new Promise((r) => setTimeout(r, 60));
          net.setOnline(true);
        } else await me.lock(v.myPicks.length % 4);
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    await until(() => me.getState().snapshot?.phase === "completed");
    const o = duelOutcome(me.getState().snapshot!);
    expect(o).not.toBeNull();
    expect(o!.you.result.wins + o!.you.result.draws + o!.you.result.losses).toBe(38);
    await until(() => roomView(me.getState())!.status === "completed"); // after the final reveal
    bot.stop();
    me.dispose();
  });
});

// ── peer-to-peer presence transport (artifact `room` capability) ──────────────
import { PresenceTransport, commitmentOf, type PresenceChannel } from "@/multiplayer/presenceTransport";

class FakeRoom {
  presences = new Map<string, Record<string, unknown>>();
  handlers = new Set<() => void>();
  online = new Set<string>();
  channel(peer: string): PresenceChannel & { drop(): void; back(): void } {
    this.online.add(peer);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the fake channel closes over its room
    const room = this;
    return {
      async presence(patch) {
        if (!room.online.has(peer)) throw new Error("offline");
        room.presences.set(peer, { ...(room.presences.get(peer) ?? {}), ...patch });
        queueMicrotask(() => room.handlers.forEach((h) => h()));
      },
      peers() {
        return [...room.online].map((p) => ({ peer: p, isMe: p === peer, sameTab: p === peer, presence: room.presences.get(p) ?? {}, updatedAt: 0 }));
      },
      onPeers(h) {
        room.handlers.add(h);
        return () => room.handlers.delete(h);
      },
      drop() {
        room.online.delete(peer);
        room.handlers.forEach((h) => h());
      },
      back() {
        room.online.add(peer);
        room.handlers.forEach((h) => h());
      },
    };
  }
}
const memStore = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("presence transport (no server: commit–reveal)", () => {
  it("two peers see the same seed, hide picks until both commit, then reveal identically", async () => {
    const room = new FakeRoom();
    let seq = 0;
    const rand = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
    const a = new PresenceTransport(room.channel("pa"), memStore(), { rand });
    const b = new PresenceTransport(room.channel("pb"), memStore(), { rand });
    const created = await a.create({ rulesetId: "liveduel", formation: "4231", nickname: "Florian", token: T(1) });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const code = created.value.code;
    expect(created.value.phase).toBe("waiting");
    b.hint(code, "liveduel", "4231");
    const joined = await b.join(code, { nickname: "Anthony", token: T(2) });
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    await flush();
    expect(joined.value.seed).toBe(created.value.seed);
    expect(joined.value.formation).toBe("4231");

    const snapsA: import("@/multiplayer").RoomSnapshot[] = [];
    const snapsB: import("@/multiplayer").RoomSnapshot[] = [];
    const ua = a.watch(code, T(1), { onSnapshot: (s) => snapsA.push(s) });
    const ub = b.watch(code, T(2), { onSnapshot: (s) => snapsB.push(s) });
    await flush();

    // A locks first: B must not learn A's choice (only a commitment travels).
    const la = await a.send(code, T(1), { type: "lock", round: 0, optionIndex: 3 });
    expect(la.ok).toBe(true);
    await flush();
    const rawA = room.presences.get("pa")!.eraxi as { commits: string[]; reveals: unknown[] };
    expect(rawA.commits).toHaveLength(1);
    expect(rawA.reveals[0]).toBeNull();
    expect(snapsB.at(-1)!.seats.find((s) => !s.you)!.picks[0]).toBeNull();
    // A cannot run ahead in lockstep.
    const ahead = await a.send(code, T(1), { type: "lock", round: 1, optionIndex: 0 });
    expect(ahead.ok).toBe(false);

    // B picks the SAME option: allowed, no first-click advantage.
    await b.send(code, T(2), { type: "lock", round: 0, optionIndex: 3 });
    for (let i = 0; i < 4; i++) await flush();
    const lastA = snapsA.at(-1)!;
    const lastB = snapsB.at(-1)!;
    expect(lastA.revealedThrough).toBe(1);
    expect(lastB.revealedThrough).toBe(1);
    expect(lastA.seats.map((s) => s.picks[0])).toEqual([3, 3]);
    expect(lastB.seats.map((s) => s.picks[0])).toEqual([3, 3]);
    ua();
    ub();
  });

  it("a forged reveal is ignored; a reload re-joins the same seat with its picks", async () => {
    const room = new FakeRoom();
    const storeA = memStore();
    const a = new PresenceTransport(room.channel("pa"), storeA);
    const b = new PresenceTransport(room.channel("pb"), memStore());
    const c = await a.create({ rulesetId: "liveduel", formation: "433", nickname: "A", token: T(1) });
    if (!c.ok) throw new Error("create");
    const code = c.value.code;
    await b.join(code, { nickname: "B", token: T(2) });
    await a.send(code, T(1), { type: "lock", round: 0, optionIndex: 1 });
    await b.send(code, T(2), { type: "lock", round: 0, optionIndex: 2 });
    for (let i = 0; i < 3; i++) await flush();
    let seen: import("@/multiplayer").RoomSnapshot | null = null;
    const u = a.watch(code, T(1), { onSnapshot: (s) => (seen = s) });
    await flush();
    await flush();
    expect(seen!.seats.find((s) => !s.you)!.picks[0]).toBe(2);

    // B tampers: claims option 4 with its old salt → commitment mismatch → pick unknown again.
    const pb = room.presences.get("pb")!.eraxi as { reveals: [number, string][] };
    room.presences.set("pb", { eraxi: { ...(room.presences.get("pb")!.eraxi as object), reveals: [[4, pb.reveals[0]![1]]] } });
    room.handlers.forEach((h) => h());
    await flush();
    expect(seen!.seats.find((s) => !s.you)!.picks[0]).toBeNull();
    u();

    // Reload A: a fresh transport on the same device store keeps seat + pick.
    const a2 = new PresenceTransport(room.channel("pa2"), storeA);
    room.online.delete("pa");
    const back = await a2.join(code, { nickname: "A", token: T(1) });
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.seats.find((s) => s.you)!.picks).toEqual([1]);
    expect(commitmentOf("abcde", "s", 0, 0, 1, "x")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("a whole duel over presence ends with both sides agreeing on the verified result", async () => {
    const room = new FakeRoom();
    const a = new PresenceTransport(room.channel("pa"), memStore());
    const b = new PresenceTransport(room.channel("pb"), memStore());
    const c = await a.create({ rulesetId: "liveduel", formation: "433", nickname: "A", token: T(1) });
    if (!c.ok) throw new Error("create");
    const code = c.value.code;
    await b.join(code, { nickname: "B", token: T(2) });
    let sa: import("@/multiplayer").RoomSnapshot | null = null;
    let sb: import("@/multiplayer").RoomSnapshot | null = null;
    const ua = a.watch(code, T(1), { onSnapshot: (s) => (sa = s) });
    const ub = b.watch(code, T(2), { onSnapshot: (s) => (sb = s) });
    for (let r = 0; r < ROUNDS; r++) {
      expect((await a.send(code, T(1), { type: "lock", round: r, optionIndex: r % 4 })).ok).toBe(true);
      expect((await b.send(code, T(2), { type: "lock", round: r, optionIndex: (r + 1) % 4 })).ok).toBe(true);
      for (let i = 0; i < 3; i++) await flush();
    }
    expect(sa!.phase).toBe("completed");
    expect(sb!.phase).toBe("completed");
    const oa = duelOutcome(sa!)!;
    const ob = duelOutcome(sb!)!;
    expect(oa.you.result.points).toBe(ob.opponent.result.points);
    expect(oa.opponent.result.points).toBe(ob.you.result.points);
    expect(oa.headToHead.you).toBe(ob.headToHead.opponent);
    // Rematch needs both votes, then both move to a new seed together.
    await a.send(code, T(1), { type: "rematch" });
    for (let i = 0; i < 2; i++) await flush();
    expect(sa!.generation).toBe(0);
    await b.send(code, T(2), { type: "rematch" });
    for (let i = 0; i < 4; i++) await flush();
    expect(sb!.generation).toBe(1);
    expect(sa!.generation).toBe(1);
    expect(sa!.seed).toBe(sb!.seed);
    expect(sa!.seed).not.toBe(c.value.seed);
    ua();
    ub();
  });
});
