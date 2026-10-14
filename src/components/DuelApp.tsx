"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { DraftState, FormationId, SeasonResult } from "@/types";
import { FORMATIONS, ROUNDS, RULESETS, getFormation, lineupPlayers, pickOption, replayDraft, runSeason } from "@/engine";
import { getPlayerEra } from "@/data";
import {
  MemoryTransport,
  RoomClient,
  RoomServer,
  duelOutcome,
  duelPhase,
  roomView,
  sharedTurn,
  standings,
  startBot,
  type ClientState,
  type RoomRulesetId,
  type RoomSnapshot,
  type RoomTransport,
  type SeatView,
} from "@/multiplayer";
import type { LastPick } from "@/game/machine";
import { useI18n } from "@/i18n/react";
import { DraftScreen } from "./DraftScreen";
import { Pitch } from "./Pitch";
import { ImpactChips, ScoreCell } from "./ChallengeScreens";
import { Button, ConfirmLeave, EraMark, HomeButton, Tag, Wordmark } from "./ui";

/**
 * LIVE DUEL, SHARED DRAFT + PARTY ROOM screens. All network behaviour sits behind
 * RoomTransport (HTTP to the authoritative server, peer presence in the artifact, or an
 * in-page practice server). This file only renders RoomClient state.
 */

export type RoomEntry =
  | { kind: "create"; rulesetId: RoomRulesetId; formation: FormationId }
  | { kind: "join"; code: string }
  | { kind: "practice"; rulesetId: RoomRulesetId; formation: FormationId };

export interface RoomPlatform {
  /** A transport for real rooms, or null when this view cannot host live rooms. */
  connect(): Promise<RoomTransport | null>;
  roomUrl(code: string): string;
  setLocationRoom(code: string | null): void;
}

export interface SeasonDone {
  key: string;
  draft: DraftState;
  result: SeasonResult;
}

interface DuelAppProps {
  entry: RoomEntry;
  platform: RoomPlatform;
  token: string;
  nickname: string;
  onNickname: (n: string) => void;
  onExit: () => void;
  onSeason: (s: SeasonDone) => void;
  onRoomResult: (r: { key: string; kind: "duel" | "party"; won: boolean; vs?: { opponent: string; yours: number; theirs: number } }) => void;
  duelRecord: { wins: number; losses: number };
  /** Increments when the browser Back button is pressed while in a room. */
  backSignal?: number;
  /** Practice: replay the room's draw solo (never recorded, never a result). */
  /** Practice: replay the room's draw solo (never recorded, never a result). `picks`: continue from these choices. */
  onPracticeDraw?: (config: { seed: string; formation: FormationId; mode: RoomRulesetId; engineVersion: string; picks?: number[] }) => void;
}

/** The room this tab is in, so a reload re-enters it without the join screen. */
const ACTIVE_KEY = "eraxi:activeRoom";
function activeRoom(): string | null {
  try {
    return window.sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function setActiveRoom(code: string | null) {
  try {
    if (code) window.sessionStorage.setItem(ACTIVE_KEY, code);
    else window.sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

const BOT_NAMES = ["House XI", "Tiki Bot", "Catenaccio", "Gegenpress"];
const botToken = (i: number) => `house-bot-token-${i}-${Math.random().toString(36).slice(2, 10)}`;
const isDuelRuleset = (id: RoomRulesetId) => RULESETS[id].multiplayerType === "duel";

export function DuelApp(props: DuelAppProps) {
  const { platform, token, onExit } = props;
  const { t } = useI18n();
  const [entry, setEntry] = useState<RoomEntry>(props.entry);
  const rejoin = props.entry.kind === "join" && typeof window !== "undefined" && activeRoom() === props.entry.code;
  const [stage, setStage] = useState<"entry" | "connecting" | "room" | "unavailable" | "error">(props.entry.kind === "join" && !rejoin ? "entry" : "connecting");
  const [practice, setPractice] = useState(props.entry.kind === "practice");
  const [client, setClient] = useState<RoomClient | null>(null);
  const [started, setStarted] = useState(false); // party: entered the draft
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const bots = useRef<{ stop(): void }[]>([]);
  const nickRef = useRef(props.nickname);
  nickRef.current = props.nickname;

  const stopBots = () => {
    for (const b of bots.current) b.stop();
    bots.current = [];
  };

  const open = useCallback(
    async (e: RoomEntry) => {
      setStage("connecting");
      setErrorKey(null);
      stopBots();
      const isPractice = e.kind === "practice";
      let transport: RoomTransport | null;
      if (isPractice) transport = new MemoryTransport(new RoomServer(), { latencyMs: 60 });
      else transport = await platform.connect();
      if (!transport) {
        setStage("unavailable");
        return;
      }
      const c = new RoomClient(transport, { token, nickname: nickRef.current.trim() });
      const ok = e.kind === "join" ? await c.join(e.code) : await c.create(e.rulesetId, e.formation);
      if (!ok) {
        const err = c.getState().error;
        setErrorKey(
          err?.code === "not_found" ? "room.closed" : err?.code === "expired" ? "room.expired" : err?.code === "room_full" ? "room.full" : err?.code === "version_mismatch" ? "room.update" : "room.couldNot",
        );
        setStage("error");
        c.dispose();
        return;
      }
      const code = c.getState().code!;
      if (isPractice) {
        const n = e.rulesetId === "party" ? 3 : 1;
        for (let i = 0; i < n; i++) bots.current.push(startBot(transport, code, { token: botToken(i), nickname: BOT_NAMES[i]!, thinkMs: [900, 2600] }));
      } else {
        platform.setLocationRoom(code);
        setActiveRoom(code);
      }
      setPractice(isPractice);
      setStarted(false);
      setClient((old) => {
        old?.dispose();
        return c;
      });
      setStage("room");
    },
    [platform, token],
  );

  useEffect(() => {
    if (props.entry.kind !== "join" || rejoin) void open(props.entry);
    return () => stopBots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => client?.dispose(), [client]);

  const leave = useCallback(() => {
    stopBots();
    void client?.leave();
    platform.setLocationRoom(null);
    setActiveRoom(null);
    onExit();
  }, [client, platform, onExit]);

  // Back outside a live room (entry / connecting / error) simply leaves.
  const outerBack = useRef(props.backSignal ?? 0);
  useEffect(() => {
    if ((props.backSignal ?? 0) === outerBack.current) return;
    outerBack.current = props.backSignal ?? 0;
    if (stage !== "room") leave();
  }, [props.backSignal, stage, leave]);

  const practiceNow = (rulesetId: RoomRulesetId, formation: FormationId) => {
    void client?.leave();
    platform.setLocationRoom(null);
    setActiveRoom(null);
    const e: RoomEntry = { kind: "practice", rulesetId, formation };
    setEntry(e);
    void open(e);
  };

  if (stage === "entry" && entry.kind === "join") {
    return <JoinEntry code={entry.code} nickname={props.nickname} onNickname={props.onNickname} onPlay={() => void open(entry)} onBack={leave} />;
  }
  if (stage === "connecting") return <Centered onBack={leave} title={t("room.opening")} pulse />;
  if (stage === "unavailable" || stage === "error") {
    const fallback = entry.kind === "join" ? { rulesetId: "liveduel" as const, formation: "433" as const } : entry;
    return (
      <Centered onBack={leave} title={stage === "error" ? t("room.unavailable") : t("room.off")}>
        <p className="mt-3 max-w-[360px] text-[14px] text-ash-2">{stage === "error" ? t(errorKey ?? "room.couldNot") : t("room.offBody")}</p>
        <div className="mt-6 flex w-full max-w-[360px] flex-col gap-2">
          {errorKey === "room.update" && (
            <Button onClick={() => window.location.reload()} className="w-full">
              {t("room.reload")}
            </Button>
          )}
          <Button onClick={() => practiceNow(fallback.rulesetId, fallback.formation)} className="w-full">
            {t("room.practice")}
          </Button>
          <Button variant="ghost" onClick={leave} className="w-full">
            {t("common.back")}
          </Button>
        </div>
      </Centered>
    );
  }
  if (!client) return null;
  // Leaving for a solo run of this draw releases the seat and the URL first (a reload must not re-enter the room).
  const practiceDraw: DuelAppProps["onPracticeDraw"] = props.onPracticeDraw
    ? (cfg) => {
        stopBots();
        void client.leave();
        platform.setLocationRoom(null);
        setActiveRoom(null);
        props.onPracticeDraw!(cfg);
      }
    : undefined;
  return <RoomScreens {...props} onPracticeDraw={practiceDraw} client={client} practice={practice} started={started} onStart={() => setStarted(true)} onLeave={leave} onPractice={practiceNow} />;
}

function useClient(client: RoomClient): ClientState {
  return useSyncExternalStore(
    (fn) => client.subscribe(fn),
    () => client.getState(),
    () => client.getState(),
  );
}

function RoomScreens({
  client,
  practice,
  started,
  onStart,
  onLeave,
  onPractice,
  platform,
  onSeason,
  onRoomResult,
  duelRecord,
  backSignal,
  onPracticeDraw,
}: DuelAppProps & { client: RoomClient; practice: boolean; started: boolean; onStart: () => void; onLeave: () => void; onPractice: (r: RoomRulesetId, f: FormationId) => void }) {
  const { t } = useI18n();
  const state = useClient(client);
  const view = roomView(state);
  const snap = state.snapshot;
  const lastTap = useRef(0);
  const [confirm, setConfirm] = useState(false);

  const myPicks = view?.myPicks ?? [];
  const confirmed = useMemo(() => (snap?.seats.find((s) => s.you)?.picks ?? []).map((p) => p ?? 0), [snap]);
  const config = snap ? { seed: snap.seed, formation: snap.formation, mode: snap.rulesetId, engineVersion: snap.engineVersion } : null;

  // Board: my picks (incl. a pending one); the round on screen shows its offer.
  const board = useMemo(() => {
    if (!config || !view) return null;
    const shown = Math.min(view.displayRound, ROUNDS - 1);
    const before = replayDraft(config, myPicks.slice(0, shown), null);
    if (shown === 0) return { draft: before, lastPick: null as LastPick | null };
    const prev = replayDraft(config, myPicks.slice(0, shown - 1), null);
    const out = pickOption(prev, myPicks[shown - 1]!);
    return {
      draft: before,
      lastPick: { key: shown, slotIndex: out.slotIndex, impacts: out.impacts, playerEraId: out.state.picks.at(-1)?.playerEraId ?? "" } as LastPick,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.seed, config?.formation, view?.displayRound, myPicks.join(",")]);

  const mine = useMemo(() => {
    if (!config || confirmed.length < ROUNDS) return null;
    const draft = replayDraft(config, confirmed, null);
    return { draft, result: runSeason(draft) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.seed, confirmed.join(",")]);

  // Career + records: once per room generation.
  const key = snap ? `${snap.code}:${snap.generation}${practice ? ":practice" : ""}` : "";
  const isDuel = snap ? isDuelRuleset(snap.rulesetId) : true;
  const outcome = useMemo(() => (snap && isDuel && snap.phase === "completed" ? duelOutcome(snap) : null), [snap, isDuel]);
  const seasonSent = useRef<string | null>(null);
  const resultSent = useRef<string | null>(null);
  useEffect(() => {
    if (mine && seasonSent.current !== key) {
      seasonSent.current = key;
      onSeason({ key, draft: mine.draft, result: mine.result });
    }
  }, [mine, key, onSeason]);
  useEffect(() => {
    if (!snap || resultSent.current === key || practice) return;
    if (isDuel && outcome) {
      resultSent.current = key;
      onRoomResult({ key, kind: "duel", won: outcome.winner === "you", vs: { opponent: outcome.opponent.nickname, yours: outcome.you.result.points, theirs: outcome.opponent.result.points } });
    } else if (!isDuel && snap.phase === "completed" && snap.seats.length > 1) {
      resultSent.current = key;
      const top = standings(snap)[0];
      onRoomResult({ key, kind: "party", won: Boolean(top?.you) });
    }
  }, [snap, outcome, key, practice, isDuel, onRoomResult]);

  // Browser Back = the Home button: one confirmation only when leaving affects the other seat(s).
  const leaveRef = useRef<() => void>(onLeave);
  const backSeen = useRef(backSignal ?? 0);
  useEffect(() => {
    if ((backSignal ?? 0) === backSeen.current) return;
    backSeen.current = backSignal ?? 0;
    leaveRef.current();
  }, [backSignal]);

  // A room that ended under us (expired, closed, newer engine): a clear state, never a frozen screen.
  const fatal = state.error && (state.error.code === "expired" || state.error.code === "not_found" || state.error.code === "version_mismatch") ? state.error.code : null;
  if (fatal) {
    return (
      <Centered onBack={onLeave} title={t("room.unavailable")}>
        <p className="mt-3 max-w-[360px] text-[14px] text-ash-2">{t(fatal === "version_mismatch" ? "room.update" : fatal === "expired" ? "room.expired" : "room.closed")}</p>
        <div className="mt-6 flex w-full max-w-[360px] flex-col gap-2">
          {fatal === "version_mismatch" ? (
            <Button onClick={() => window.location.reload()} className="w-full">
              {t("room.reload")}
            </Button>
          ) : (
            <Button onClick={() => onPractice(snap?.rulesetId ?? "liveduel", snap?.formation ?? "433")} className="w-full">
              {t("room.practice")}
            </Button>
          )}
          <Button variant="ghost" onClick={onLeave} className="w-full">
            {t("common.back")}
          </Button>
        </div>
      </Centered>
    );
  }
  if (!snap || !view) return <Centered onBack={onLeave} title={t("room.opening")} pulse />;
  const ruleset = RULESETS[snap.rulesetId];
  const opponent = view.others[0] ?? null;
  const inGame = view.status !== "waiting" && view.status !== "completed";
  const requestLeave = () => (inGame && !practice ? setConfirm(true) : onLeave());
  leaveRef.current = requestLeave;
  const confirmSheet = (
    <ConfirmLeave open={confirm} title={t("nav.confirmRoom")} body={t("nav.confirmRoomBody")} onStay={() => setConfirm(false)} onLeave={onLeave} />
  );

  // ── lobby ──
  if (view.status === "waiting" || (!isDuel && !started && view.myPicks.length === 0)) {
    return (
      <Lobby
        snap={snap}
        link={practice ? null : platform.roomUrl(snap.code)}
        isDuel={isDuel}
        onStart={onStart}
        onLeave={onLeave}
        onPractice={() => onPractice(snap.rulesetId, snap.formation)}
        practice={practice}
      />
    );
  }

  // ── result ──
  if (view.status === "completed" && state.pending === null && mine) {
    if (isDuel) {
      return (
        <>
          <DuelResult
            snap={snap}
            outcome={outcome}
            mine={mine}
            opponent={opponent}
            record={duelRecord}
            practice={practice}
            onRematch={() => void client.rematch()}
            onLeave={onLeave}
            onPracticeDraw={onPracticeDraw && config ? () => onPracticeDraw({ ...config, mode: snap.rulesetId }) : undefined}
          />
          <RoomDebug state={state} transport={practice ? "memory" : "live"} />
        </>
      );
    }
    return <PartyResult snap={snap} mine={mine} onRematch={() => void client.rematch()} onLeave={onLeave} practice={practice} />;
  }

  // ── draft ──
  if (!board) return null;
  const onPick = (i: number) => {
    const now = performance.now();
    if (now - lastTap.current < 250) return;
    lastTap.current = now;
    void client.lock(i);
  };
  const lockedOption = view.status === "locked" || view.status === "reveal" ? view.lockedOption : null;
  const reveal = state.reveal ? state.reveal.entries.map((e) => ({ name: e.nickname, optionIndex: e.optionIndex, you: e.you })) : null;
  const turn = view.status === "reveal" ? null : sharedTurn(snap, view.displayRound);
  const taken = turn && !turn.first.you && turn.taken !== null ? { optionIndex: turn.taken, name: turn.first.nickname } : null;

  return (
    <>
      <DraftScreen
        draft={board.draft}
        lastPick={board.lastPick}
        showRatings={ruleset.ratingsVisible}
        challengeLabel={null}
        onPick={onPick}
        onReroll={() => {}}
        onExit={requestLeave}
        room={{
          lockedOption,
          reveal,
          taken,
          waiting: view.status === "theirTurn",
          status: (
            <RoomStatus
              snap={snap}
              status={view.status}
              opponent={opponent}
              reconnecting={view.reconnecting}
              practice={practice}
              taken={taken ? board.draft : null}
              takenIndex={taken?.optionIndex ?? null}
              // The opponent is gone (left, or silent past the grace period): the draw can still be finished, as practice.
              onFinishSolo={
                isDuel && !practice && opponent?.connection === "disconnected" && onPracticeDraw && config
                  ? () => onPracticeDraw({ ...config, mode: snap.rulesetId, picks: [...view.myPicks] })
                  : undefined
              }
            />
          ),
        }}
      />
      {confirmSheet}
      <RoomDebug state={state} transport={practice ? "memory" : "live"} />
    </>
  );
}

function RoomStatus({
  snap,
  status,
  opponent,
  reconnecting,
  practice,
  taken,
  takenIndex,
  onFinishSolo,
}: {
  onFinishSolo?: () => void;
  snap: RoomSnapshot;
  status: string;
  opponent: SeatView | null;
  reconnecting: boolean;
  practice: boolean;
  taken: DraftState | null;
  takenIndex: number | null;
}) {
  const { t } = useI18n();
  const isDuel = isDuelRuleset(snap.rulesetId);
  const name = opponent?.nickname ?? t("room.opponent");
  const kind = practice ? t("room.tag.practice") : t(`room.tag.${snap.rulesetId}`);
  const left = isDuel ? t("room.statusDuel", { kind: kind.toUpperCase(), name: name.toUpperCase() }) : t("room.statusParty", { n: snap.seats.length });
  let chip: { text: string; tone: "volt" | "ash" | "loss" } | null = null;
  const oppState = isDuel && opponent?.connection !== "connected" ? opponent?.connection : null;
  if (reconnecting) chip = { text: t("room.reconnecting"), tone: "ash" };
  else if (oppState === "disconnected") chip = { text: t("room.left", { name }), tone: "loss" };
  else if (status === "locked") chip = { text: oppState ? t("room.lockedReconnecting", { name }) : t("room.lockedWaiting", { name }), tone: "ash" };
  else if (oppState === "reconnecting") chip = { text: t("room.oppReconnecting", { name }), tone: "ash" };
  else if (status === "theirTurn") chip = { text: t("room.theirTurn", { name }), tone: "ash" };
  else if (taken && takenIndex !== null) {
    const off = taken.draw.rounds[taken.round];
    const id = off?.options[takenIndex];
    chip = { text: t("room.yourTurnAfter", { name, player: id ? getPlayerEra(id).shortName : "—" }), tone: "volt" };
  } else if (status === "opponentReady") chip = { text: t("room.oppLocked", { name }), tone: "volt" };
  else if (!isDuel) {
    const done = snap.seats.filter((s) => s.completed).length;
    if (done > 0) chip = { text: t("room.finished", { n: done }), tone: "ash" };
  }
  return (
    <>
      <span className={`truncate text-[11px] font-semibold tracking-[0.14em] text-ash ${chip ? "hidden lg:inline" : ""}`}>{left}</span>
      {chip && onFinishSolo && (
        <button type="button" data-action="finish-solo" onClick={onFinishSolo} className="flex min-h-9 min-w-0 shrink items-center gap-1.5 truncate rounded-full bg-loss/15 px-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-loss lg:ml-auto" role="status">
          {chip.text} · <span className="text-chalk">{t("room.finishSolo")} ›</span>
        </button>
      )}
      {chip && !onFinishSolo && (
        <span
          className={`flex min-w-0 shrink items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] lg:ml-auto ${
            chip.tone === "volt" ? "bg-volt text-ink" : chip.tone === "loss" ? "bg-loss/15 text-loss" : "bg-chalk/[0.07] text-ash-2"
          }`}
          role="status"
        >
          {chip.tone === "ash" && <span className="size-1.5 animate-pulse rounded-full bg-ash-2" aria-hidden />}
          {chip.text}
        </span>
      )}
    </>
  );
}

// ── screens ─────────────────────────────────────────────────────────────────

function Centered({ title, onBack, pulse = false, children }: { title: string; onBack: () => void; pulse?: boolean; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pb-6 pt-4">
      <header className="flex h-12 items-center">
        <HomeButton onHome={onBack} className="-ml-2" />
      </header>
      <section className="flex flex-1 flex-col items-center justify-center text-center">
        {pulse && <EraMark size={40} draw className="mb-4 text-chalk" />}
        <p className={`font-display text-[34px] font-extrabold uppercase leading-none ${pulse ? "text-ash-2" : ""}`}>{title}</p>
        {children}
      </section>
    </main>
  );
}

function JoinEntry({ code, nickname, onNickname, onPlay, onBack }: { code: string; nickname: string; onNickname: (n: string) => void; onPlay: () => void; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
      <header className="flex h-12 items-center justify-between">
        <HomeButton onHome={onBack} className="-ml-2" />
        <Wordmark className="text-[24px]" />
      </header>
      <section className="flex flex-1 flex-col justify-center py-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash">{t("room.label", { code: code.toUpperCase() })}</p>
        <h1 className="mt-2 font-display text-[54px] font-extrabold uppercase leading-[0.9]">
          {t("room.pitch1")}
          <br />
          {t("room.pitch2")}
          <br />
          <span className="text-transparent [-webkit-text-stroke:1.5px_var(--color-chalk)]">{t("room.pitch3")}</span>
        </h1>
        <p className="mt-4 max-w-[360px] text-[14px] text-ash-2">{t("room.pitchBody")}</p>
      </section>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onPlay();
        }}
      >
        <input
          value={nickname}
          onChange={(e) => onNickname(e.target.value.slice(0, 16))}
          placeholder={t("live.name")}
          maxLength={16}
          autoComplete="nickname"
          aria-label={t("live.name")}
          className="h-12 rounded-[12px] border border-chalk/15 bg-ink-2 px-4 text-[16px] text-chalk placeholder:text-ash focus:border-volt focus:outline-none"
        />
        <Button type="submit" className="h-[68px] w-full text-[30px]">
          {t("room.play")}
        </Button>
      </form>
    </main>
  );
}

function Lobby({
  snap,
  link,
  isDuel,
  onStart,
  onLeave,
  onPractice,
  practice,
}: {
  snap: RoomSnapshot;
  link: string | null;
  isDuel: boolean;
  onStart: () => void;
  onLeave: () => void;
  onPractice: () => void;
  practice: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the link is visible and selectable */
    }
  };
  const empty = Math.max(0, (isDuel ? 2 : Math.min(snap.maxPlayers, Math.max(3, snap.seats.length + 1))) - snap.seats.length);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
      <header className="flex h-12 items-center justify-between">
        <HomeButton onHome={onLeave} className="-ml-2" />
        <div className="flex gap-1.5">
          <Tag>{t(`room.tag.${snap.rulesetId}`)}</Tag>
          <Tag>{FORMATIONS[snap.formation].label}</Tag>
        </div>
      </header>
      <section className="flex flex-1 flex-col justify-center py-6">
        {!practice && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ash">{t("room.code")}</p>
            <p className="mt-1 font-display text-[88px] font-extrabold uppercase leading-[0.85] tracking-[0.08em] tnum" aria-label={`${t("room.code")} ${snap.code.split("").join(" ")}`}>
              {snap.code}
            </p>
            {link && (
              <div className="mt-4 flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={t("room.link")}
                  className="h-11 min-w-0 flex-1 rounded-[10px] border border-chalk/12 bg-ink-2 px-3 text-[13px] text-ash-2"
                />
                <Button variant="secondary" onClick={copy} className="h-11 shrink-0 px-4 text-[17px]">
                  {copied ? t("room.copied") : t("room.copy")}
                </Button>
              </div>
            )}
          </>
        )}
        <ul className="mt-6 flex flex-col gap-1.5">
          {snap.seats.map((s) => (
            <li key={s.seatId} className="flex h-11 items-center gap-3 rounded-[10px] border border-line bg-ink-2 px-3">
              <span className={`size-2 rounded-full ${s.connection === "connected" ? "bg-volt" : s.connection === "reconnecting" ? "bg-ash-2" : "bg-loss"}`} aria-hidden />
              <span className="font-display text-[20px] font-bold uppercase">{s.nickname}</span>
              {s.you && <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t("common.you")}</span>}
              {s.seatId === snap.hostSeat && !isDuel && <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t("room.host")}</span>}
            </li>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`empty-${i}`} className="flex h-11 items-center gap-3 rounded-[10px] border border-dashed border-chalk/12 px-3 text-[14px] text-ash">
              <span className="size-2 animate-pulse rounded-full bg-ash" aria-hidden />
              {isDuel ? t("room.waitingOpp") : t("room.waitingFriends")}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] text-ash-2">{isDuel ? t("room.shareDuel") : t("room.shareParty", { n: snap.maxPlayers })}</p>
        <p className="mt-1 text-[12.5px] text-ash">{t(`mode.${snap.rulesetId}.desc`)}</p>
      </section>
      <div className="flex flex-col gap-2">
        {!isDuel && (
          <Button onClick={onStart} className="h-[64px] w-full text-[28px]">
            {t("room.start")}
          </Button>
        )}
        {!practice && (
          <Button variant="ghost" onClick={onPractice} className="w-full">
            {isDuel ? t("room.practiceNoOne") : t("room.practiceBots")}
          </Button>
        )}
      </div>
    </main>
  );
}

function DuelResult({
  snap,
  outcome,
  mine,
  opponent,
  record,
  practice,
  onRematch,
  onLeave,
  onPracticeDraw,
}: {
  snap: RoomSnapshot;
  outcome: ReturnType<typeof duelOutcome>;
  mine: { draft: DraftState; result: SeasonResult };
  opponent: SeatView | null;
  record: { wins: number; losses: number };
  practice: boolean;
  onRematch: () => void;
  onLeave: () => void;
  onPracticeDraw?: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"you" | "them">("you");
  const name = opponent?.nickname ?? t("room.opponent");
  const me = snap.seats.find((s) => s.you);
  const formation = getFormation(snap.formation);

  if (!outcome) {
    return (
      <Centered onBack={onLeave} title={t("room.waitingFor", { name })} pulse>
        <p className="mt-3 text-[14px] text-ash-2 tnum">{t("room.yourSeason", { pts: mine.result.points, max: mine.result.maxPoints })}</p>
      </Centered>
    );
  }

  const won = outcome.winner === "you";
  const margin = Math.abs(outcome.you.result.points - outcome.opponent.result.points);
  const h = outcome.headToHead;
  const iVoted = Boolean(me?.rematch);
  const theyVoted = Boolean(opponent?.rematch);
  const diffs = outcome.comparison.differences.filter((d) => d.impact).slice(0, 4);

  const actions = (
    <>
      <Button onClick={onRematch} disabled={iVoted} className="h-[62px] w-full text-[26px]">
        {iVoted ? t("room.waitingRematch", { name }) : theyVoted ? t("room.wantsRematch", { name }) : t("room.rematch")}
      </Button>
      <div className={`grid gap-2 ${onPracticeDraw ? "grid-cols-2" : "grid-cols-1"}`}>
        {onPracticeDraw && (
          <Button variant="secondary" onClick={onPracticeDraw} className="h-[52px] w-full whitespace-nowrap px-2 text-[15px] min-[380px]:text-[17px]">
            {t("room.practiceDraw")}
          </Button>
        )}
        <Button variant="secondary" onClick={onLeave} className="h-[52px] w-full whitespace-nowrap px-2 text-[15px] min-[380px]:text-[17px]">
          {t("room.leaveRoom")}
        </Button>
      </div>
      <p className="text-center text-[11.5px] text-ash">
        {t("room.rematchNote")}
        {practice ? "" : ` ${t("room.duelsRecord", { w: record.wins, l: record.losses })}`}
      </p>
    </>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start lg:gap-14 lg:px-10 lg:py-10">
      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1">
            <HomeButton onHome={onLeave} className="-ml-2" />
            <Wordmark className="text-[22px]" />
          </span>
          <Tag>{practice ? t("room.tag.practice") : t(`room.tag.${snap.rulesetId}`)}</Tag>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 animate-pop">
          <ScoreCell label={t("common.you")} value={outcome.you.result.points} highlight={won} />
          <ScoreCell label={name} value={outcome.opponent.result.points} highlight={!won} />
        </div>
        <p className={`mt-4 font-display text-[44px] font-extrabold uppercase leading-none ${won ? "text-volt" : "text-loss"}`}>{won ? t("room.youWin") : t("room.theyWin", { name })}</p>
        <p className="mt-1 text-[13px] text-ash-2 tnum">
          {outcome.decidedBy === "points" ? t("room.byPoints", { n: margin }) : t("room.levelH2h")}{" "}
          {t("room.youWent", { w: outcome.you.result.wins, d: outcome.you.result.draws, l: outcome.you.result.losses })}
        </p>

        <div className={`mt-4 flex items-center justify-between rounded-[12px] border px-3.5 py-2.5 ${outcome.decidedBy === "head_to_head" ? "border-volt/50 bg-volt/[0.06]" : "border-line bg-ink-2"}`}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">
            {t("room.h2h")} · {outcome.decidedBy === "points" ? t("room.h2hFun") : t("room.h2hDecider")}
          </span>
          <span className="font-display text-[22px] font-bold uppercase tnum">
            {t("room.h2hScore", { a: h.you, b: h.opponent, name })}
            {h.penalties && <span className="ml-1 text-[14px] text-ash-2">{t("room.pens", { a: h.penalties[0], b: h.penalties[1] })}</span>}
          </span>
        </div>

        {/* Secondary: the four team numbers side by side (the season score above decides). */}
        <div className="mt-3 grid grid-cols-[auto_repeat(4,minmax(0,1fr))] items-center gap-x-2 gap-y-1 rounded-[12px] border border-line bg-ink-2 px-3 py-2 text-center" data-testid="duel-ratings">
          <span />
          {(["att", "mid", "def", "fit"] as const).map((k) => (
            <span key={k} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t(`stat.${k}`)}</span>
          ))}
          {([["you", outcome.you], ["them", outcome.opponent]] as const).map(([who, side]) => {
            const r = side.result.teamRatings;
            const other = (who === "you" ? outcome.opponent : outcome.you).result.teamRatings;
            return (
              <div key={who} className="contents">
                <span className="max-w-[88px] truncate text-left text-[12.5px] font-semibold">{who === "you" ? t("common.you") : name}</span>
                {(["att", "mid", "def", "fit"] as const).map((k) => (
                  <b key={k} className={`font-display text-[18px] tnum ${r[k] > other[k] ? "text-chalk" : "text-ash"}`}>
                    {r[k]}
                  </b>
                ))}
              </div>
            );
          })}
        </div>

        <h2 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("room.diffs")}</h2>
        <DiffList diffs={diffs} />

        <div className="mt-5 hidden flex-col gap-2 lg:flex">{actions}</div>
      </section>

      <section className="mt-5 flex flex-col lg:mt-0">
        <div className="mb-2 flex gap-1 self-start rounded-full bg-chalk/[0.06] p-1" role="tablist">
          {(["you", "them"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={`h-9 rounded-full px-4 font-display text-[16px] font-bold uppercase tracking-[0.04em] ${tab === v ? "bg-chalk text-ink" : "text-ash-2"}`}
            >
              {v === "you" ? t("ch.yourXI") : t("ch.theirXI", { name })}
            </button>
          ))}
        </div>
        <Pitch
          formation={formation}
          players={lineupPlayers(tab === "you" ? outcome.you.draft : outcome.opponent.draft)}
          variant="draft"
          showRatings
          className="h-[320px] w-full sm:h-[380px] lg:h-auto lg:[aspect-ratio:0.8] lg:max-h-[74dvh]"
        />
        <div className="h-44 lg:hidden" aria-hidden />
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 bg-gradient-to-t from-ink via-ink to-ink/0 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-8 lg:hidden">{actions}</div>
      </section>
    </main>
  );
}

function DiffList({ diffs }: { diffs: NonNullable<ReturnType<typeof duelOutcome>>["comparison"]["differences"] }) {
  const { t, m } = useI18n();
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {diffs.map((d) => (
        <li key={d.round} className="rounded-[12px] border border-line bg-ink-2 px-3.5 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("ch.round", { n: d.round, context: d.context })}</div>
          <p className="mt-1 text-[14px] font-medium leading-snug">{m(d.summaryMsg)}</p>
          {d.impact && <ImpactChips impact={d.impact} />}
        </li>
      ))}
      {diffs.length === 0 && <li className="text-[14px] text-ash-2">{t("room.identical")}</li>}
    </ul>
  );
}

function PartyResult({
  snap,
  mine,
  onRematch,
  onLeave,
  practice,
}: {
  snap: RoomSnapshot;
  mine: { draft: DraftState; result: SeasonResult };
  onRematch: () => void;
  onLeave: () => void;
  practice: boolean;
}) {
  const { t } = useI18n();
  const table = standings(snap);
  const me = snap.seats.find((s) => s.you);
  const isHost = me?.seatId === snap.hostSeat;
  const finished = table.filter((x) => x.points !== null).length;
  let rank = 0;
  const r = mine.result;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
      <header className="flex h-12 items-center justify-between">
        <HomeButton onHome={onLeave} className="-ml-2" />
        <div className="flex gap-1.5">
          <Tag>{practice ? t("room.practiceParty") : t("room.partyTag", { code: snap.code.toUpperCase() })}</Tag>
          <Tag>{FORMATIONS[snap.formation].label}</Tag>
        </div>
      </header>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash">{finished === table.length ? t("room.finalTable") : t("room.finishedOf", { a: finished, b: table.length })}</p>
      <ol className="mt-2 flex flex-col gap-1.5">
        {table.map((x) => {
          if (x.points !== null) rank++;
          return (
            <li key={x.seatId} className={`flex h-14 items-center gap-3 rounded-[12px] border px-3.5 ${x.you ? "border-volt/60 bg-volt/[0.06]" : "border-line bg-ink-2"}`}>
              <span className="w-6 font-display text-[22px] font-bold text-ash tnum">{x.points !== null ? rank : "·"}</span>
              <span className="min-w-0 flex-1 truncate font-display text-[22px] font-bold uppercase">
                {x.nickname}
                {x.you && <span className="ml-2 font-sans text-[11px] font-semibold tracking-[0.12em] text-ash">{t("common.you").toUpperCase()}</span>}
              </span>
              {x.points !== null ? (
                <span className="font-display text-[32px] font-extrabold tnum">{x.points}</span>
              ) : (
                <span className="text-[12px] text-ash-2 tnum">{x.connection === "disconnected" ? t("room.leftShort") : t("room.drafting", { n: x.progress })}</span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[13px] text-ash-2 tnum">{t("room.partySeason", { w: r.wins, d: r.draws, l: r.losses, gf: r.goalsFor, ga: r.goalsAgainst })}</p>
      <div className="min-h-6 flex-1" />
      <Pitch formation={getFormation(snap.formation)} players={lineupPlayers(mine.draft)} variant="draft" showRatings className="h-[260px] w-full" />
      <div className="mt-3 flex flex-col gap-2">
        {isHost ? (
          <Button onClick={onRematch} className="h-[62px] w-full text-[26px]">
            {t("room.runBack")}
          </Button>
        ) : (
          <p className="rounded-[12px] border border-line px-3 py-3 text-center text-[13px] text-ash-2">{t("room.hostRunBack")}</p>
        )}
        <Button variant="secondary" onClick={onLeave} className="h-[52px] w-full text-[19px]">
          {t("room.leaveRoom")}
        </Button>
      </div>
    </main>
  );
}

/**
 * Development-only multiplayer diagnostics (NODE_ENV !== "production" and localStorage
 * `eraxi:debug` = "1"). Never rendered in a production build.
 */
function RoomDebug({ state, transport }: { state: ClientState; transport: "memory" | "live" }) {
  const [on] = useState(() => {
    if (process.env.NODE_ENV === "production") return false;
    try {
      return window.localStorage.getItem("eraxi:debug") === "1";
    } catch {
      return false;
    }
  });
  if (!on || process.env.NODE_ENV === "production") return null;
  const snap = state.snapshot;
  return (
    <pre className="pointer-events-none fixed bottom-2 left-2 z-50 max-w-[92vw] overflow-hidden rounded-[8px] bg-ink/95 p-2 font-mono text-[11px] leading-tight text-ash-2 shadow-lg" data-testid="room-debug">
      {[
        `phase ${duelPhase(state)} · net ${state.net} (${transport}) · failures ${state.failures ?? 0}`,
        snap ? `room ${snap.code} gen ${snap.generation} v${snap.version} · engine ${snap.engineVersion} · seed ${snap.seed.slice(0, 10)}` : "no snapshot",
        snap ? `round ${snap.round} revealed ${snap.revealedThrough} · ${snap.seats.map((s) => `${s.you ? "*" : ""}${s.nickname}:${s.connection}:${s.progress}${s.rematch ? ":R" : ""}`).join("  ")}` : "",
        state.pending ? `pending r${state.pending.round}=${state.pending.optionIndex}` : "pending —",
        state.error ? `error ${state.error.code}` : "",
      ]
        .filter(Boolean)
        .join("\n")}
    </pre>
  );
}
