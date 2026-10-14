import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, ROUNDS, createDraft, replayDraft, runSeason } from "@/engine";
import { MIN_SAMPLE, LocalPickQueue, aggregateOffer, offerKey, visibleStat, type PickEvent } from "@/stats/pickStats";
import { DEFAULT_PROFILE, averagePoints, recordRoom, recordRun, type StoredProfile } from "@/game/storage";
import { botChoice, roomView, type ClientState, type RoomSnapshot } from "@/multiplayer";

const ev = (over: Partial<PickEvent>): PickEvent => ({
  engineVersion: "2",
  seed: "seedaaaa",
  rulesetId: "daily",
  round: 0,
  clubEraId: "x",
  optionIndex: 0,
  playerEraId: "p0",
  fitDelta: 0,
  finalPoints: null,
  duelWon: null,
  at: 0,
  ...over,
});

describe("pick statistics (structures only, never fabricated)", () => {
  const key = offerKey({ engineVersion: "2", seed: "seedaaaa", rulesetId: "daily", round: 0 });

  it("says nothing below the minimum sample", () => {
    const few = Array.from({ length: MIN_SAMPLE - 1 }, (_, i) => ev({ at: i }));
    expect(aggregateOffer(few, key)).toBeNull();
  });

  it("aggregates real events: pick rate, average score, duel win rate, FIT impact, labels", () => {
    const events = [
      ...Array.from({ length: 20 }, (_, i) => ev({ playerEraId: "p0", finalPoints: 80, duelWon: i % 2 === 0, fitDelta: 4, at: i })),
      ...Array.from({ length: 10 }, (_, i) => ev({ playerEraId: "p1", finalPoints: 70, fitDelta: -2, at: 100 + i })),
      ...Array.from({ length: 2 }, (_, i) => ev({ playerEraId: "p2", at: 200 + i })),
      ev({ round: 1, playerEraId: "other" }), // a different offer: excluded
    ];
    const s = aggregateOffer(events, key)!;
    expect(s.total).toBe(32);
    const [p0, p1, p2] = s.options;
    expect(p0!.playerEraId).toBe("p0");
    expect(p0!.pickRate).toBeCloseTo(20 / 32);
    expect(p0!.avgPoints).toBe(80);
    expect(p0!.duelWinRate).toBe(0.5);
    expect(p0!.avgFitDelta).toBe(4);
    expect(p0!.label).toBe("popular");
    expect(p1!.duelWinRate).toBeNull();
    expect(p2!.avgPoints).toBeNull(); // unfinished seasons are not guessed
    expect(p2!.label).toBe("contrarian");
  });

  it("is only visible after the player's own decision", () => {
    const events = Array.from({ length: MIN_SAMPLE }, (_, i) => ev({ at: i }));
    const s = aggregateOffer(events, key);
    expect(visibleStat(s, false)).toBeNull();
    expect(visibleStat(s, true)).not.toBeNull();
  });

  it("local queue records picks and settles them with the season result", () => {
    const m = new Map<string, string>();
    const q = new LocalPickQueue({ get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) });
    q.record(ev({ at: 1 }));
    q.record(ev({ round: 1, at: 2 }));
    q.settle({ engineVersion: "2", seed: "seedaaaa", rulesetId: "daily" }, 77, true);
    expect(q.pending().map((e) => [e.finalPoints, e.duelWon])).toEqual([
      [77, true],
      [77, true],
    ]);
  });
});

describe("career data", () => {
  const run = (points: number) => ({ at: 0, seed: "s", points, wins: 0, draws: 0, losses: 0, formation: "433" as const, mode: "classic" as const, overall: 80, fit: 80 });
  const season = runSeason(replayDraft({ seed: "careerseed", formation: "433", mode: "classic", engineVersion: ENGINE_VERSION }, Array(ROUNDS).fill(0), null));

  it("keeps an exact average and counts duels once per room generation", () => {
    let p: StoredProfile = { ...DEFAULT_PROFILE };
    expect(averagePoints(p)).toBeNull();
    p = recordRun(p, run(80), season).profile;
    p = recordRun(p, run(61), season).profile;
    expect(averagePoints(p)).toBe(71);
    p = recordRoom(p, "abcde:0", "duel", true);
    p = recordRoom(p, "abcde:0", "duel", true); // reload: not double-counted
    p = recordRoom(p, "abcde:1", "duel", false);
    p = recordRoom(p, "fghij:0", "party", true);
    expect(p.career.duel).toEqual({ wins: 1, losses: 1 });
    expect(p.career.party).toEqual({ played: 1, wins: 1 });
  });
});

describe("room view ordering", () => {
  it("the last pick shows 'locked' until the reveal, not a premature result", () => {
    const seat = (you: boolean, progress: number): RoomSnapshot["seats"][number] => ({
      seatId: you ? "s1" : "s2",
      nickname: you ? "A" : "B",
      you,
      connection: "connected",
      progress,
      picks: Array.from({ length: progress }, (_, i) => (you || i < 10 ? 0 : null)),
      completed: progress === ROUNDS,
      score: null,
      rematch: false,
    });
    const snapshot: RoomSnapshot = {
      code: "abcde", rulesetId: "liveduel", formation: "433", engineVersion: ENGINE_VERSION, seed: "roomseed", generation: 0, version: 1,
      phase: "drafting", round: 10, revealedThrough: 10, maxPlayers: 2, hostSeat: "s1", you: "s1", seats: [seat(true, 11), seat(false, 10)], serverTime: 0,
    };
    const s: ClientState = { code: "abcde", snapshot, net: "online", pending: null, reveal: null, error: null, busy: false };
    expect(roomView(s)!.status).toBe("locked");
    expect(roomView({ ...s, snapshot: { ...snapshot, revealedThrough: 11, phase: "completed" } })!.status).toBe("completed");
  });

  it("the practice bot plays legal, deterministic picks", () => {
    const picks: number[] = [];
    for (let r = 0; r < ROUNDS; r++) picks.push(botChoice("botseed1", "433", "liveduel", picks));
    expect(picks.every((p) => p >= 0 && p < 4)).toBe(true);
    const again: number[] = [];
    for (let r = 0; r < ROUNDS; r++) again.push(botChoice("botseed1", "433", "liveduel", again));
    expect(again).toEqual(picks);
    expect(createDraft({ seed: "botseed1", formation: "433", mode: "liveduel", engineVersion: ENGINE_VERSION }).draw.rounds).toHaveLength(ROUNDS);
  });
});

import { RoomServer } from "@/multiplayer";
describe("rejoin", () => {
  it("a reload without a name keeps the seat's nickname; an unnamed newcomer is 'Player'", () => {
    const server = new RoomServer();
    const tok = (n: number) => `tok-${String(n).padStart(16, "0")}`;
    const c = server.create({ rulesetId: "liveduel", formation: "433", nickname: "Florian", token: tok(1) });
    if (!c.ok) throw new Error("create");
    const j = server.join(c.value.code, { nickname: "", token: tok(2) });
    expect(j.ok && j.value.seats[1]!.nickname).toBe("Player");
    server.join(c.value.code, { nickname: "Anthony", token: tok(2) });
    const again = server.join(c.value.code, { nickname: "  ", token: tok(2) });
    expect(again.ok && again.value.seats.find((s) => s.you)!.nickname).toBe("Anthony");
  });
});
