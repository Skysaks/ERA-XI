import { describe, expect, it } from "vitest";
import type { DraftConfig, DraftState, ModeId } from "@/types";
import {
  ENGINE_VERSION,
  ERA_BUCKETS,
  GAUNTLET_LENGTH,
  OUT_OF_POSITION_THRESHOLD,
  RULESETS,
  buildChallengePayload,
  createDraft,
  currentOffer,
  decodeChallenge,
  encodeChallenge,
  getFormation,
  gauntletOpponents,
  isDraftComplete,
  lineupPlayers,
  oneClubIds,
  pickOption,
  positionFamiliarity,
  runSeason,
  seededClub,
  targetSlot,
  validateRuleset,
} from "@/engine";
import { ALL_CLUB_ERAS, getClub, getClubEra, getPlayerEra } from "@/data";
import { EUROPEAN_CUP_WINNERS } from "@/data/champions";
import { MemoryTransport, RoomClient, RoomServer, applyIntent, createRoom, joinRoom, roomView, sharedTurn, snapshotFor, startBot, duelOutcome } from "@/multiplayer";

const SEEDS = Array.from({ length: 40 }, (_, i) => `v13seed${i}`);
const cfg = (seed: string, mode: ModeId, extra: Partial<DraftConfig> = {}): DraftConfig => ({ seed, formation: "433", mode, engineVersion: ENGINE_VERSION, ...extra });

/** A sensible drafter: in-position picks first, strongest otherwise. */
function playOut(s: DraftState): DraftState {
  let st = s;
  while (!isDraftComplete(st)) {
    const offer = currentOffer(st)!;
    const taken = new Set(lineupPlayers(st).filter(Boolean).map((p) => p!.playerId));
    const idx = offer.options.findIndex((id) => !taken.has(getPlayerEra(id).playerId));
    st = pickOption(st, Math.max(0, idx)).state;
  }
  return st;
}

describe("V1.3 rulesets", () => {
  it("every ruleset is valid and live", () => {
    for (const r of Object.values(RULESETS)) {
      expect(validateRuleset(r), r.id).toEqual([]);
      expect(r.status, r.id).toBe("live");
    }
  });

  it("every new solo mode drafts and simulates over many seeds", () => {
    for (const mode of ["nations", "oneclub", "blitz", "cult", "gauntlet", "mystery", "champions", "position"] as ModeId[]) {
      for (const seed of SEEDS.slice(0, 25)) {
        const s = playOut(createDraft(cfg(seed, mode)));
        const r = runSeason(s);
        expect(r.points, `${mode} ${seed}`).toBeGreaterThanOrEqual(0);
        expect(r.points).toBeLessThanOrEqual(r.maxPoints);
      }
    }
  });
});

describe("pools", () => {
  it("Nations draws only national teams", () => {
    for (const seed of SEEDS) for (const o of createDraft(cfg(seed, "nations")).draw.rounds) expect(getClubEra(o.clubEraId).kind).toBe("nation");
  });

  it("Champions draws only European Cup winning squads; the winners table matches real team ids", () => {
    for (const id of Object.values(EUROPEAN_CUP_WINNERS)) expect(getClub(id).kind).toBe("club");
    const winners = ALL_CLUB_ERAS.filter((e) => e.europeanCups.length > 0);
    expect(winners.length).toBeGreaterThanOrEqual(30);
    for (const seed of SEEDS) {
      for (const o of createDraft(cfg(seed, "champions")).draw.rounds) {
        const era = getClubEra(o.clubEraId);
        expect(era.europeanCups.length).toBeGreaterThan(0);
        for (const y of era.europeanCups) expect(EUROPEAN_CUP_WINNERS[y]).toBe(era.clubId);
      }
    }
    expect(getClubEra("barcelona-2008").europeanCups).toEqual([2009, 2011]);
  });

  it("Cult XI never offers a player above 86", () => {
    for (const seed of SEEDS) for (const o of createDraft(cfg(seed, "cult")).draw.rounds) for (const id of o.options) expect(getPlayerEra(id).overall).toBeLessThanOrEqual(86);
  });

  it("One Club: every eligible club drafts over many seeds; the seeded or chosen club is respected", () => {
    const ids = oneClubIds();
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const clubId of ids) {
      for (const seed of SEEDS.slice(0, 12)) {
        const s = createDraft(cfg(seed, "oneclub", { choice: { clubId } }));
        expect(s.draw.clubId).toBe(clubId);
        const seen = new Set<string>();
        const all = s.draw.reserve === s.draw.rounds[0] ? s.draw.rounds : [...s.draw.rounds, s.draw.reserve];
        for (const o of all) {
          expect(getClubEra(o.clubEraId).clubId).toBe(clubId);
          for (const id of o.options) {
            const pid = getPlayerEra(id).playerId;
            expect(seen.has(pid), `${clubId} ${seed} ${pid}`).toBe(false);
            seen.add(pid);
          }
        }
      }
    }
    expect(createDraft(cfg("clubseed", "oneclub")).draw.clubId).toBe(seededClub("clubseed", ENGINE_VERSION));
    expect(() => createDraft(cfg("clubseed", "oneclub", { choice: { clubId: "leicester" } }))).toThrow();
    expect(() => createDraft(cfg("clubseed", "classic", { choice: { clubId: ids[0]! } }))).toThrow();
  });

  it("Era Lock honours a chosen period", () => {
    for (const bucket of ERA_BUCKETS) {
      const s = createDraft(cfg("chosen1", "eralock", { choice: { bucket } }));
      expect(s.draw.bucket).toBe(bucket);
      const inBucket = s.draw.rounds.filter((o) => getClubEra(o.clubEraId).bucket === bucket).length;
      expect(inBucket).toBeGreaterThanOrEqual(9);
    }
  });
});

describe("Position Draft", () => {
  it("names each slot once; every option can play it; the pick lands there", () => {
    for (const formation of ["433", "4231", "442", "352", "343"] as const) {
      for (const seed of SEEDS.slice(0, 15)) {
        let s = createDraft(cfg(seed, "position", { formation }));
        const f = getFormation(formation);
        expect([...s.draw.targets!].sort((a, b) => a - b)).toEqual(f.slots.map((_, i) => i));
        while (!isDraftComplete(s)) {
          const t = targetSlot(s)!;
          const offer = currentOffer(s)!;
          expect(offer.options.length).toBeGreaterThanOrEqual(2);
          for (const id of offer.options) expect(positionFamiliarity(getPlayerEra(id).positions, f.slots[t]!.position)).toBeGreaterThanOrEqual(OUT_OF_POSITION_THRESHOLD);
          const out = pickOption(s, 0);
          expect(out.slotIndex).toBe(t);
          s = out.state;
        }
        expect(lineupPlayers(s).every(Boolean)).toBe(true);
      }
    }
  });
});

describe("Gauntlet", () => {
  it("climbs 10 legends weakest to strongest and ends at the first defeat", () => {
    const ladder = gauntletOpponents("ladder1", ENGINE_VERSION);
    expect(ladder).toHaveLength(GAUNTLET_LENGTH);
    expect(ladder[0]!.tier).toBe("dangerous");
    expect(ladder[9]!.tier).toBe("giant");
    for (const seed of SEEDS) {
      const r = runSeason(playOut(createDraft(cfg(seed, "gauntlet"))));
      expect(r.format).toBe("gauntlet");
      expect(r.maxPoints).toBe(10);
      expect(r.points).toBe(r.wins);
      expect(r.losses).toBeLessThanOrEqual(1);
      expect(r.matchResults).toHaveLength(Math.min(10, r.wins + r.losses));
      if (r.losses) expect(r.matchResults.at(-1)!.outcome).toBe("L");
      for (const m of r.matchResults) if (m.goalsFor === m.goalsAgainst) expect(m.penalties).not.toBeNull();
      expect(runSeason(playOut(createDraft(cfg(seed, "gauntlet"))))).toEqual(r);
    }
  });
});

describe("challenge links", () => {
  it("V1.2 links (engine v2) still decode and verify on their original dataset", () => {
    const v12 = "eyJ2IjoxLCJlIjoiMiIsInMiOiJyenAyZmpocCIsIm0iOiJjbGFzc2ljIiwiZiI6IjQzMyIsInNjIjo5MiwicCI6IjAxMDEyMTAwMzAyIiwiciI6LTEsImwiOiI1ODM5NDc2MjEwYSIsIm4iOiJGbG9yaWFuIn0";
    const d = decodeChallenge(v12);
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.challenge.creatorResult.points).toBe(92);
      for (const o of d.challenge.creatorState.draw.rounds) expect(getClubEra(o.clubEraId).since).toBe(2);
    }
    const v12b = "eyJ2IjoxLCJlIjoiMiIsInMiOiI0OWY5emJyMyIsIm0iOiJjbGFzc2ljIiwiZiI6IjQzMyIsInNjIjo4NSwicCI6IjAwMTAwMTAwMjEyIiwiciI6LTEsImwiOiI5M2E4NTIwMTc0NiIsIm4iOiJGbG9yaWFuIn0";
    expect(decodeChallenge(v12b).ok).toBe(true);
  });

  it("new modes and pre-draft choices round-trip through a link", () => {
    const cases: DraftConfig[] = [
      cfg("linkseed1", "oneclub", { choice: { clubId: oneClubIds()[0]! } }),
      cfg("linkseed2", "eralock", { choice: { bucket: "1980s" } }),
      cfg("linkseed3", "position", { formation: "352" }),
      cfg("linkseed4", "gauntlet"),
      cfg("linkseed5", "nations"),
      cfg("linkseed6", "mystery"),
    ];
    for (const c of cases) {
      const s = playOut(createDraft(c));
      const r = runSeason(s);
      const d = decodeChallenge(encodeChallenge(buildChallengePayload(s, r, "Flo")));
      expect(d.ok, c.mode).toBe(true);
      if (d.ok) {
        expect(d.challenge.creatorResult.points).toBe(r.points);
        expect(d.challenge.creatorState.draw).toEqual(s.draw);
      }
    }
  });
});

describe("Shared Draft", () => {
  const T = (n: number) => `token-${String(n).padStart(12, "0")}`;
  const room = () => {
    const s0 = createRoom({ code: "shard", rulesetId: "shared", formation: "433", engineVersion: ENGINE_VERSION, seedBase: "sharedseed", token: T(1), nickname: "A", now: 0 });
    const j = joinRoom(s0, T(2), "B", 1);
    if (!j.ok) throw new Error("join");
    return j.value.state;
  };

  it("alternates first pick, blocks the taken player, and shows picks at once", () => {
    let s = room();
    // Round 0: A (seat 1) first; B cannot go before A.
    expect(applyIntent(s, T(2), { type: "lock", round: 0, optionIndex: 0 }, 2).ok).toBe(false);
    const a0 = applyIntent(s, T(1), { type: "lock", round: 0, optionIndex: 2 }, 3);
    expect(a0.ok).toBe(true);
    s = a0.ok ? a0.value : s;
    expect(snapshotFor(s, T(2), 4).seats[0]!.picks[0]).toBe(2); // visible to B immediately
    const taken = applyIntent(s, T(2), { type: "lock", round: 0, optionIndex: 2 }, 4);
    expect(taken.ok).toBe(false);
    const b0 = applyIntent(s, T(2), { type: "lock", round: 0, optionIndex: 1 }, 5);
    expect(b0.ok).toBe(true);
    s = b0.ok ? b0.value : s;
    // Round 1: B first now.
    expect(applyIntent(s, T(1), { type: "lock", round: 1, optionIndex: 0 }, 6).ok).toBe(false);
    const snapA = snapshotFor(s, T(1), 6);
    expect(sharedTurn(snapA, 1)?.waiting).toBe(true);
    expect(roomView({ code: "shard", snapshot: snapA, net: "online", pending: null, reveal: null, error: null, busy: false })!.status).toBe("theirTurn");
  });

  it("a full shared draft against the bot finishes with different XIs from one pool", async () => {
    const server = new RoomServer();
    const net = new MemoryTransport(server, { latencyMs: 1 });
    const me = new RoomClient(net, { token: T(1), nickname: "Flo" }, { revealMs: 1 });
    expect(await me.create("shared", "433")).toBe(true);
    const code = me.getState().snapshot!.code;
    const bot = startBot(new MemoryTransport(server, { latencyMs: 1 }), code, { token: T(2), nickname: "Bot", thinkMs: [0, 2] });
    const until = async (c: () => boolean) => {
      const t0 = Date.now();
      while (!c()) {
        if (Date.now() - t0 > 8000) throw new Error("timeout");
        await new Promise((r) => setTimeout(r, 5));
      }
    };
    await until(() => me.getState().snapshot?.phase === "drafting");
    while (roomView(me.getState())!.myPicks.length < 11) {
      const snap = me.getState().snapshot!;
      const v = roomView(me.getState())!;
      if (v.status === "choosing" || v.status === "opponentReady") {
        const t = sharedTurn(snap, v.myPicks.length);
        await me.lock(t?.taken === 0 ? 1 : 0);
      }
      await new Promise((r) => setTimeout(r, 3));
    }
    await until(() => me.getState().snapshot?.phase === "completed");
    const o = duelOutcome(me.getState().snapshot!)!;
    const mine = new Set(o.you.draft.picks.map((p) => p.playerEraId));
    for (const p of o.opponent.draft.picks) expect(mine.has(p.playerEraId)).toBe(false);
    bot.stop();
    me.dispose();
  });
});

import { PresenceTransport, type PresenceChannel } from "@/multiplayer";
describe("Shared Draft over presence (no server)", () => {
  it("enforces turns and the taken player; picks are public at once", async () => {
    const pres = new Map<string, Record<string, unknown>>();
    const handlers = new Set<() => void>();
    const chan = (peer: string): PresenceChannel => ({
      async presence(patch) {
        pres.set(peer, { ...(pres.get(peer) ?? {}), ...patch });
        queueMicrotask(() => handlers.forEach((h) => h()));
      },
      peers: () => [...pres.keys()].map((p) => ({ peer: p, isMe: p === peer, sameTab: p === peer, presence: pres.get(p) ?? {}, updatedAt: 0 })),
      onPeers(h) {
        handlers.add(h);
        return () => handlers.delete(h);
      },
    });
    const store = () => {
      const m = new Map<string, string>();
      return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
    };
    const tok = (n: number) => `tok-${String(n).padStart(16, "0")}`;
    const a = new PresenceTransport(chan("pa"), store());
    const b = new PresenceTransport(chan("pb"), store(), { findMs: 50 });
    const c = await a.create({ rulesetId: "shared", formation: "433", nickname: "A", token: tok(1) });
    if (!c.ok) throw new Error("create");
    const j = await b.join(c.value.code, { nickname: "B", token: tok(2) });
    expect(j.ok && j.value.rulesetId).toBe("shared");
    await new Promise((r) => setTimeout(r, 0));
    // Round 0: B must wait for A.
    expect((await b.send(c.value.code, tok(2), { type: "lock", round: 0, optionIndex: 1 })).ok).toBe(false);
    expect((await a.send(c.value.code, tok(1), { type: "lock", round: 0, optionIndex: 1 })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    // B can't take the same player, can take another.
    expect((await b.send(c.value.code, tok(2), { type: "lock", round: 0, optionIndex: 1 })).ok).toBe(false);
    const ok = await b.send(c.value.code, tok(2), { type: "lock", round: 0, optionIndex: 2 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.seats.find((s) => !s.you)!.picks[0]).toBe(1);
  });
});
