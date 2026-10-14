import type { FormationId } from "@/types";
import { autoPlace, createDraft, currentOffer, getFormation, isDraftComplete, lineupPlayers, pickOption, rateLineup, rngFor, ENGINE_VERSION } from "@/engine";
import { getPlayerEra } from "@/data";
import { RoomClient, sharedTurn } from "./client";
import type { RoomTransport } from "./transport";
import type { RoomRulesetId } from "./types";

/**
 * House bot for practice duels (and multiplayer tests). Plays like a sensible human:
 * best team value with a bias for balance, occasional "fan pick", a human-ish delay.
 */
export function botChoice(seed: string, formation: FormationId, rulesetId: RoomRulesetId, picks: readonly number[], taken: number | null = null): number {
  let s = createDraft({ seed, formation, mode: rulesetId, engineVersion: ENGINE_VERSION });
  for (const p of picks) s = pickOption(s, p).state;
  if (isDraftComplete(s)) return 0;
  const offer = currentOffer(s)!;
  const f = getFormation(formation);
  const rng = rngFor(seed, "bot", picks.length);
  const roll = rng.next();
  const open = offer.options.map((_, i) => i).filter((i) => i !== taken);
  if (roll < 0.16) return open[rng.int(open.length)] ?? 0; // fan pick
  const values: { i: number; v: number }[] = [];
  offer.options.forEach((id, i) => {
    if (i === taken) return;
    const after = autoPlace(lineupPlayers(s), getPlayerEra(id), f);
    const r = rateLineup(after, f);
    const n = after.filter(Boolean).length;
    values.push({ i, v: r.overall * n + (r.fit * 3 * n) / 11 });
  });
  values.sort((a, b) => b.v - a.v);
  // A practice opponent, not an optimiser: sometimes settles for the second-best option.
  return (roll < 0.4 ? values[1] : values[0])?.i ?? 0;
}

export function startBot(transport: RoomTransport, code: string, opts: { token: string; nickname: string; thinkMs?: [number, number] }) {
  const client = new RoomClient(transport, { token: opts.token, nickname: opts.nickname }, { revealMs: 0 });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let plannedFor = -1;
  const [lo, hi] = opts.thinkMs ?? [1200, 3200];
  const unsub = client.subscribe((s) => {
    const snap = s.snapshot;
    const me = snap?.seats.find((x) => x.you);
    if (!snap || !me || snap.phase !== "drafting" || s.pending) return;
    const round = me.progress;
    if (round >= 11 || plannedFor === round) return;
    if (snap.round >= 0 && round > snap.revealedThrough) return;
    const turn = sharedTurn(snap, round);
    if (turn?.waiting) return;
    plannedFor = round;
    const wait = lo + rngFor(snap.seed, "bot-delay", round).next() * (hi - lo);
    timer = setTimeout(() => {
      const picks = me.picks.map((p) => p ?? 0);
      void client.lock(botChoice(snap.seed, snap.formation, snap.rulesetId, picks, turn?.taken ?? null));
    }, wait);
  });
  void client.join(code);
  return {
    client,
    stop() {
      if (timer) clearTimeout(timer);
      unsub();
      client.dispose();
    },
  };
}
