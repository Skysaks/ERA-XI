"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DraftState, PlayerEra } from "@/types";
import { getClub, getClubEra, getPlayerEra } from "@/data";
import {
  ROUNDS,
  RULESETS,
  canReroll,
  currentOffer,
  draftRatings,
  getFormation,
  lineupPlayers,
  lineOf,
  previewPick,
  rerollsAllowed,
  rngFor,
  targetSlot,
  destinationsFor,
  solvability,
  tacticalConnections,
  tacticalMoment,
  POSITION_LINE,
  type PickPreview,
  type TacticalMoment,
} from "@/engine";
import type { LastPick } from "@/game/machine";
import { useI18n } from "@/i18n/react";
import { Pitch } from "./Pitch";
import { BrandStamp, HomeButton, useReducedMotion } from "./ui";
import { PlayerSheet, type PlayerHistoryView, type TeamImpact } from "./PlayerSheet";
import type { KnowledgeLevel } from "@/game/settings";
import { useKnowledge } from "@/knowledge/catalog";
import { eraFacts, factMessage, playerFacts } from "@/knowledge/facts";

interface DraftScreenProps {
  draft: DraftState;
  lastPick: LastPick | null;
  showRatings: boolean;
  challengeLabel: string | null;
  onPick: (optionIndex: number, auto?: boolean) => void;
  onReroll: () => void;
  /** Back to the main menu (the parent decides whether to confirm). */
  onExit: () => void;
  /** Live rooms: simultaneous hidden picks, then a short reveal. */
  room?: DraftRoomProps;
  /** Settings: tactical impact hints (pick toasts, FIT deltas). Forced on in competitive drafts. */
  hints?: boolean;
  /** Settings: auto-placement preview (landing slot chip + pitch highlight). Forced on in competitive drafts. */
  preview?: boolean;
  /** Real crowd share of the pick just made — null (nothing shown) until a backend supplies it. */
  postPickRate?: number | null;
  /** Reposition during the draft: tap a player, then a slot (absent in rooms and Position Draft). */
  selectedSlot?: number | null;
  onTapSlot?: (i: number) => void;
  onClearSelection?: () => void;
  /** First run ever: one line of micro-guidance on rounds 1–3, then nothing. */
  guide?: boolean;
  /** Knowledge Layer level (Settings). */
  knowledge?: KnowledgeLevel;
  /** Passport history for the profile sheet. */
  historyOf?: (playerId: string) => PlayerHistoryView | null;
  /** A real tactical improvement happened (subtle haptic, if enabled). */
  onMoment?: () => void;
}

export interface DraftRoomProps {
  /** My locked option for the shown round (null while choosing). */
  lockedOption: number | null;
  /** Everyone's choice for the shown round, during the reveal window. */
  reveal: { name: string; optionIndex: number; you: boolean }[] | null;
  /** Shared Draft: the option the first picker took this round (not available). */
  taken?: { optionIndex: number; name: string } | null;
  /** Shared Draft: waiting for the other player's first pick. */
  waiting?: boolean;
  /** Status strip (opponent ready, connection). Replaces the label row. */
  status: ReactNode;
}

const LINE_ORDER = { ATT: 0, MID: 1, DEF: 2, GK: 3 } as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Blitz: the option picked when the clock runs out — fixed by the seed, so a challenge replays it. */
export function blitzAutoPick(draft: DraftState): number {
  const offer = currentOffer(draft);
  return rngFor(draft.config.seed, "blitz", draft.round).int(offer?.options.length ?? 1);
}

export function DraftScreen({
  draft,
  lastPick,
  showRatings,
  challengeLabel,
  onPick,
  onReroll,
  onExit,
  room,
  hints = true,
  preview = true,
  postPickRate = null,
  selectedSlot = null,
  onTapSlot,
  onClearSelection,
  guide = false,
  knowledge = "standard",
  historyOf,
  onMoment,
}: DraftScreenProps) {
  const { t, lang } = useI18n();
  const kt = useKnowledge(lang);
  // Warm the next two rounds' squads while the player thinks (lazy PlayerEra materialisation,
  // ~0.4 ms per squad): the Director and the next offer never pay for it on the tap.
  useEffect(() => {
    const next = draft.draw.rounds.slice(draft.round + 1, draft.round + 3);
    if (next.length === 0 || typeof window === "undefined") return;
    const warm = () => {
      for (const o of next) for (const id of getClubEra(o.clubEraId).playerEraIds) getPlayerEra(id);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(warm, { timeout: 1200 });
      return () => w.cancelIdleCallback?.(h);
    }
    const h = setTimeout(warm, 300);
    return () => clearTimeout(h);
  }, [draft.draw.rounds, draft.round]);
  const ruleset = RULESETS[draft.config.mode];
  const hidden = ruleset.hiddenContext;
  const lockedOption = room?.lockedOption ?? null;
  const blocked = lockedOption !== null || Boolean(room?.waiting);
  const formation = getFormation(draft.config.formation);
  const players = lineupPlayers(draft);
  const offer = currentOffer(draft);
  const era = offer ? getClubEra(offer.clubEraId) : null;
  const club = era ? getClub(era.clubId) : null;
  const target = targetSlot(draft);
  const targetPos = target !== null ? formation.slots[target]?.position ?? null : null;
  const ratings = useMemo(() => draftRatings(draft), [draft]);
  const reduced = useReducedMotion();
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const fromRef = useRef<{ rect: DOMRect; label: string } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  // KNOWLEDGE LAYER: one short line after a pick — never a pause, never a click to continue.
  // STANDARD: a fact when the pick has one (max 3 per draft), else the role's one-liner the
  // first time a role appears (max 4 per draft). DEEP: every pick, tappable for the profile.
  const insightFor = useRef<{ key: number; playerEraId: string; text: string; tag: string | null }>({ key: -1, playerEraId: "", text: "", tag: null });
  // Team dimensions before the last pick: "BUILD-UP ↑" names what this pick added to the XI.
  const prevDims = useRef<{ picks: number; dims: Record<string, number> } | null>(null);
  useEffect(() => {
    prevDims.current = { picks: draft.picks.length, dims: { ...ratings.dims } };
  }, [ratings, draft.picks.length]);
  const budget = useRef({ seed: "", facts: 0, roles: 0, seenRoles: new Set<string>() });
  if (lastPick && kt && knowledge !== "minimal" && insightFor.current.key !== lastPick.key && !room) {
    const b = budget.current;
    if (b.seed !== draft.config.seed || draft.picks.length <= 1) Object.assign(b, { seed: draft.config.seed, facts: 0, roles: 0, seenRoles: new Set<string>() });
    const p = getPlayerEra(lastPick.playerEraId);
    const facts = [...playerFacts(p.id), ...eraFacts(p.clubEraId)];
    const role = p.roles[0] ?? "B2B";
    let text = "";
    let tag: string | null = null;
    if (facts[0] && (knowledge === "deep" || b.facts < 3)) {
      const m = factMessage(facts[0]);
      text = kt(m.key, m.params);
      b.facts++;
    } else if (knowledge === "deep" || (!b.seenRoles.has(role) && b.roles < 4)) {
      text = `${t(`role.${role}`)} — ${kt(`role.${role}`)}`;
      b.roles++;
      // The team dimension this pick lifted most (only when it clearly moved).
      const before = prevDims.current && prevDims.current.picks === draft.picks.length - 1 ? prevDims.current.dims : null;
      if (before) {
        let best: string | null = null;
        let gain = 2.5;
        for (const [d, v] of Object.entries(ratings.dims)) {
          const delta = v - (before[d] ?? v);
          if (delta > gain) {
            gain = delta;
            best = d;
          }
        }
        if (best) tag = `${t(`dimShort.${best}`)} ↑`;
      }
    }
    b.seenRoles.add(role);
    insightFor.current = { key: lastPick.key, playerEraId: p.id, text, tag };
  }
  // TACTICAL MOMENT: what the last pick changed in the XI's structure (a line completed, a new
  // connection, a gap closed). Read from the XI, shown once, never a pause.
  const momentFor = useRef<{ key: number; m: TacticalMoment | null; slots: number[] }>({ key: -1, m: null, slots: [] });
  if (lastPick && momentFor.current.key !== lastPick.key && !room) {
    const before = players.slice();
    before[lastPick.slotIndex] = null;
    const m = draft.picks.length >= 2 ? tacticalMoment(before, players, formation, draft.config.engineVersion) : null;
    let slots: number[] = [];
    if (m?.unit) slots = formation.slots.flatMap((s, i) => (POSITION_LINE[s.position] === m.unit && players[i] ? [i] : []));
    else if (m?.key.startsWith("tac.c.")) slots = tacticalConnections(players, formation).find((c) => `tac.c.${c.id}` === m.key)?.slots ?? [];
    momentFor.current = { key: lastPick.key, m, slots };
  }
  const moment = lastPick && momentFor.current.key === lastPick.key && momentFor.current.m ? momentFor.current : null;
  useEffect(() => {
    if (moment?.m && moment.m.tone !== "down") onMoment?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.key]);
  const destinations = useMemo(() => (selectedSlot === null ? null : destinationsFor(draft, selectedSlot)), [draft, selectedSlot]);
  const selectedPlayer = selectedSlot !== null ? players[selectedSlot] : null;
  const debug = useMemo(() => {
    try {
      return process.env.NODE_ENV !== "production" && window.localStorage.getItem("eraxi:debug") === "1" ? solvability(draft) : null;
    } catch {
      return null;
    }
  }, [draft]);

  // Options in display order. Classic: strongest first (stored order). Hidden ratings: by line, so order leaks nothing.
  const options = useMemo(() => {
    if (!offer) return [] as { player: PlayerEra; index: number; landing: PickPreview | null }[];
    const list = offer.options.map((id, index) => ({ player: getPlayerEra(id), index, landing: previewPick(draft, index) }));
    if (!showRatings) {
      list.sort(
        (a, b) =>
          LINE_ORDER[lineOf(a.player.positions[0] ?? "CM")] - LINE_ORDER[lineOf(b.player.positions[0] ?? "CM")] ||
          a.player.name.localeCompare(b.player.name),
      );
    }
    return list;
  }, [offer, draft, showRatings]);

  // A double tap must not also pick in the next round: the new offer ignores taps while it rises in.
  const lastPickAt = useRef(0);
  const pick = (index: number, el: HTMLElement | null, label: string, auto = false) => {
    if (blocked || room?.taken?.optionIndex === index) return;
    const now = performance.now();
    if (!auto && now - lastPickAt.current < 250) return;
    lastPickAt.current = now;
    if (el) fromRef.current = { rect: el.getBoundingClientRect(), label };
    setHover(null);
    onPick(index, auto);
  };

  // ── Blitz clock ──
  const timer = ruleset.pickTimer;
  const [left, setLeft] = useState<number | null>(timer);
  useEffect(() => {
    if (!timer || !offer) return;
    const started = performance.now();
    setLeft(timer);
    const id = setInterval(() => {
      const remaining = timer - (performance.now() - started) / 1000;
      if (remaining <= 0) {
        clearInterval(id);
        setLeft(0);
        const idx = blitzAutoPick(draft);
        const o = options.find((x) => x.index === idx);
        if (o) pick(o.index, document.querySelector<HTMLElement>(`[data-option="${o.index}"] [data-name]`), o.player.shortName, true);
      } else setLeft(remaining);
    }, 100);
    return () => clearInterval(id);
    // Restart on every new round only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, draft.round]);

  // Keyboard: 1–5 pick in display order, R rerolls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        const o = options[n - 1];
        if (o) {
          const el = document.querySelector<HTMLElement>(`[data-option="${o.index}"] [data-name]`);
          pick(o.index, el, o.player.shortName);
        }
      } else if (e.key === "r" || e.key === "R") {
        onReroll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Fly the chosen name onto its slot. Presentation only: state has already advanced.
  useLayoutEffect(() => {
    const from = fromRef.current;
    fromRef.current = null;
    if (!lastPick || !from || reduced) return;
    const targetEl = pitchRef.current?.querySelector<HTMLElement>(`[data-slot="${lastPick.slotIndex}"] > span`);
    if (!targetEl) return;
    const to = targetEl.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.textContent = from.label;
    ghost.className = "pointer-events-none fixed left-0 top-0 z-40 rounded-full bg-volt px-3 py-1 font-display text-[18px] font-bold uppercase text-ink";
    document.body.appendChild(ghost);
    const gw = ghost.offsetWidth;
    const gh = ghost.offsetHeight;
    const x0 = from.rect.left;
    const y0 = from.rect.top + from.rect.height / 2 - gh / 2;
    const x1 = to.left + to.width / 2 - gw / 2;
    const y1 = to.top + to.height / 2 - gh / 2;
    const anim = ghost.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.55)`, opacity: 0.15 },
      ],
      { duration: 220, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" },
    );
    const done = () => ghost.remove();
    anim.onfinish = done;
    anim.oncancel = done;
    return () => {
      anim.cancel();
    };
  }, [lastPick?.key, lastPick, reduced]);

  if (!offer || !era || !club) return null;
  const inspectOption = inspect ? options.find((o) => o.player.id === inspect) : undefined;
  const inspectImpact: TeamImpact | null =
    inspectOption?.landing && formation.slots[inspectOption.landing.slotIndex]
      ? { fitDelta: draft.picks.length ? inspectOption.landing.fitDelta : 0, position: formation.slots[inspectOption.landing.slotIndex]!.position, ratingDelta: inspectOption.landing.ratingDelta, outOfPosition: inspectOption.landing.outOfPosition }
      : null;

  const round = draft.round + 1;
  const gkIndex = formation.slots.findIndex((s) => s.position === "GK");
  const keeperMissing = players[gkIndex] === null;
  const needsKeeper = keeperMissing && ROUNDS - draft.round <= 5 && target === null;
  const rerollAvailable = canReroll(draft);
  const hasRerolls = rerollsAllowed(draft) > 0;
  const focus = lockedOption ?? hover;
  const hoverLanding = target ?? (preview && focus !== null ? options.find((o) => o.index === focus)?.landing?.slotIndex ?? null : null);
  const revealBy = (index: number) => room?.reveal?.filter((r) => r.optionIndex === index) ?? [];
  // Mystery XI: after each pick, say where that player came from.
  const lastEra = hidden && lastPick ? getClubEra(getPlayerEra(lastPick.playerEraId).clubEraId) : null;
  // First run only: three short lines, then the game stops teaching.
  const guideLine = guide && !room && draft.round < 3 ? t(`guide.r${draft.round + 1}` as "guide.r1") : null;
  const insight = !guideLine && !room && lastPick && insightFor.current.key === lastPick.key ? insightFor.current : null;

  const header = (
    <>
      <HomeButton onHome={onExit} className="-ml-2" />
      <Progress round={round} label={t("draft.roundAria", { n: round })} />
      <div className="ml-auto flex items-center gap-2">
        {timer !== null && left !== null && <Clock left={left} total={timer} />}
        <FitMeter fit={draft.picks.length ? ratings.fit : null} />
        {hasRerolls && <RerollButton available={rerollAvailable} onReroll={onReroll} />}
      </div>
    </>
  );

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[1180px] flex-col flat:grid flat:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] flat:gap-3 flat:px-[env(safe-area-inset-left)] lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-10 lg:px-10 lg:py-8">
      {/* ── Pitch column ── */}
      <section className="relative flex min-h-0 flex-1 flex-col px-3 pt-2 flat:pb-2 lg:px-0 lg:pt-0">
        <header className="flex h-12 shrink-0 items-center gap-3 px-1 lg:hidden">{header}</header>
        <div ref={pitchRef} className="relative min-h-[170px] flex-1">
          <div className="absolute inset-0">
            <Pitch
              formation={formation}
              players={players}
              variant="draft"
              showRatings={showRatings}
              freshSlot={lastPick?.slotIndex ?? null}
              freshKey={lastPick?.key}
              previewSlot={selectedSlot === null ? hoverLanding : null}
              selectedSlot={selectedSlot}
              destinations={destinations}
              onSlotClick={onTapSlot}
              highlight={moment && !guideLine ? { slots: moment.slots, key: moment.key } : null}
              className="h-full w-full"
            />
          </div>
          {insight?.text && !selectedPlayer && (
            <InsightPill
              key={`insight-${insight.key}`}
              name={getPlayerEra(insight.playerEraId).shortName}
              text={insight.text}
              tag={insight.tag}
              onOpen={knowledge === "deep" && !hidden ? () => setInspect(insight.playerEraId) : undefined}
            />
          )}
          {/* Brand moment inside the draft's first frame: over the empty half of the pitch, gone after 1.5 s. */}
          {draft.round === 0 && !selectedPlayer && <BrandStamp key={`kick-${draft.config.seed}`} className="top-2.5">{t("brand.buildEra")}</BrandStamp>}
          {guideLine && !selectedPlayer && (
            // Overlaid on the (still mostly empty) pitch: no layout cost, no shift when it stops.
            <p key={`guide-${draft.round}`} className="pointer-events-none absolute inset-x-2 bottom-1.5 z-10 mx-auto w-fit max-w-full animate-fade rounded-[8px] bg-ink/85 px-2.5 py-1 text-center text-[12px] font-medium leading-tight text-chalk" role="note">
              {guideLine}
            </p>
          )}
          {debug && (
            <p className="pointer-events-none absolute right-2 top-2 z-20 rounded bg-ink/90 px-1.5 py-0.5 font-mono text-[11px] text-ash-2" data-testid="solvability">
              {debug.feasible ? "route ✓" : `route ✗ −${debug.shortfall}`} · scarce{" "}
              {Object.entries(debug.scarcity)
                .sort((a, b) => a[1] - b[1])
                .slice(0, 3)
                .map(([sl, n]) => `${formation.slots[Number(sl)]?.position}:${n}`)
                .join(" ")}
            </p>
          )}
          {room?.reveal && (
            <div
              className="pointer-events-none absolute inset-x-3 bottom-3 mx-auto grid max-w-[440px] animate-pop grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-3 rounded-[14px] border border-volt/50 bg-ink/95 px-4 py-3 shadow-2xl"
              aria-live="assertive"
            >
              {[...room.reveal].sort((a, b) => Number(b.you) - Number(a.you)).map((r) => {
                const p = offer.options[r.optionIndex];
                return (
                  <p key={`${r.name}-${r.you}`} className="contents font-display font-extrabold uppercase">
                    <span className={`max-w-[9ch] truncate text-[17px] tracking-[0.06em] ${r.you ? "text-volt" : "text-ash-2"}`}>{r.you ? t("common.you") : r.name}</span>
                    <span className="text-[17px] text-ash">→</span>
                    <span className="truncate text-[26px] leading-[1.1]">{p ? getPlayerEra(p).shortName : "—"}</span>
                  </p>
                );
              })}
            </div>
          )}
          <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col items-start gap-1" aria-live="polite">
            {/* One tactical channel: the structural moment first (a line completed, a connection), then
                at most one impact — never a stack of badges. */}
            {lastPick && hints && moment?.m && !guideLine && (
              <span
                key={`moment-${lastPick.key}`}
                data-moment={moment.m.key}
                className={`animate-toast-long rounded-[6px] px-2 py-[3px] font-display text-[14px] font-bold uppercase tracking-[0.06em] ${moment.m.tone === "down" ? "bg-loss text-ink" : "bg-volt text-ink"}`}
              >
                {t(moment.m.key)} {moment.m.tone === "unit" ? "✓" : moment.m.tone === "up" ? "↑" : "↓"}
              </span>
            )}
            {lastPick &&
              hints &&
              (moment?.m && !guideLine ? lastPick.impacts.filter((imp) => imp.tone === "down").slice(0, 1) : lastPick.impacts).map((imp) => (
                <span
                  key={`${lastPick.key}-${imp.key}`}
                  className={`animate-toast rounded-[6px] px-2 py-[3px] font-display text-[14px] font-bold tracking-[0.06em] ${imp.tone === "up" ? "bg-volt text-ink" : "bg-loss text-ink"}`}
                >
                  {t(imp.key)} {imp.tone === "up" ? "↑" : "↓"}
                </span>
              ))}
            {lastPick && postPickRate !== null && (
              // Popularity only AFTER the pick, and only from real aggregated data.
              <span key={`rate-${lastPick.key}`} className="animate-toast rounded-[6px] bg-ink/90 px-2 py-[3px] text-[12px] font-semibold text-chalk">
                {t("draft.samePick", { pct: Math.round(postPickRate * 100) })}
              </span>
            )}
            {lastEra && (
              <span key={`era-${lastPick?.key}`} className="animate-rise rounded-[6px] bg-chalk px-2 py-[3px] font-display text-[14px] font-bold uppercase tracking-[0.04em] text-ink">
                {t("draft.mysteryReveal", { club: getClub(lastEra.clubId).name, era: lastEra.label })}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Decision column ── */}
      <section className="shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 flat:flex flat:min-h-0 flat:flex-col flat:justify-center flat:overflow-y-auto flat:pb-2 flat:pt-2 lg:flex lg:flex-col lg:justify-center lg:px-0 lg:pb-0 lg:pt-0">
        <header className="mb-8 hidden items-center gap-4 lg:flex">{header}</header>

        <div key={`${draft.round}-${offer.clubEraId}`} className="relative animate-rise">
          {selectedPlayer && (
            // Over the club header, never over the pitch: every slot stays tappable while a player is selected.
            <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-2 rounded-[12px] border border-volt/50 bg-ink pl-3 shadow-xl">
              <span className="min-w-0 flex-1 truncate text-[12px] text-ash-2">
                <b className="font-display text-[15px] uppercase text-chalk">{selectedPlayer.shortName}</b> · {t("move.hint")}
              </span>
              <button type="button" onClick={() => setInspect(selectedPlayer.id)} className="h-11 shrink-0 rounded-full border border-chalk/20 px-3 text-[12px] font-semibold text-chalk">
                {t("inspect.short")}
              </button>
              <button type="button" onClick={onClearSelection} className="grid size-11 shrink-0 place-items-center text-ash hover:text-chalk" aria-label={t("common.close")}>
                ✕
              </button>
            </div>
          )}
          {(challengeLabel || needsKeeper || room || targetPos) && (
            <div className="mb-1 flex min-h-[20px] items-center gap-2 px-1">
              {room ? room.status : challengeLabel && <span className="truncate text-[11px] font-semibold tracking-[0.14em] text-ash">{challengeLabel}</span>}
              {targetPos && (
                <span className="ml-auto shrink-0 rounded-full bg-volt px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
                  {t("draft.fill")} · {t(`posName.${targetPos}`)}
                </span>
              )}
              {needsKeeper && (
                <span className="ml-auto shrink-0 rounded-full bg-loss/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-loss">{t("draft.noKeeper")}</span>
              )}
            </div>
          )}
          <div className="mb-2.5 flex items-end gap-2.5 px-1">
            <span className="mb-1 h-7 w-1 shrink-0 rounded-full" style={{ background: hidden ? "rgb(241 239 231 / 0.25)" : club.color }} aria-hidden />
            <h1
              className={`min-w-0 truncate font-display font-extrabold uppercase leading-[0.9] tracking-[0.01em] ${
                !hidden && club.name.length > 13 ? "text-[clamp(22px,7.4vw,28px)] lg:text-[38px]" : "text-[clamp(28px,10vw,34px)] lg:text-[44px]"
              }`}
            >
              {hidden ? t("draft.mysteryClub") : club.name}
            </h1>
            <span className="mb-0.5 shrink-0 font-display text-[clamp(17px,5.8vw,22px)] font-semibold leading-none text-ash-2 tnum lg:text-[26px]">{hidden ? t("draft.mysteryEra") : era.label}</span>
          </div>

          <ul className="flex flex-col gap-2">
            {options.map(({ player, index, landing }, displayIdx) => {
              const slot = landing ? formation.slots[landing.slotIndex] : null;
              const mineLocked = lockedOption === index;
              const isTaken = room?.taken?.optionIndex === index;
              const dim = (lockedOption !== null && !mineLocked && revealBy(index).length === 0) || isTaken;
              const tags = room?.reveal
                ? revealBy(index).map((r) => ({ text: r.you ? t("common.you") : r.name, you: r.you }))
                : mineLocked
                  ? [{ text: "✓", you: true }]
                  : isTaken
                    ? [{ text: room?.taken?.name ?? t("room.taken"), you: false }]
                    : [];
              return (
                <li key={player.id} className="relative">
                  {tags.length > 0 && (
                    <span className="pointer-events-none absolute -top-1.5 right-10 z-10 flex gap-1">
                      {tags.map((tg) => (
                        <span
                          key={`${tg.text}-${tg.you}`}
                          className={`rounded-full px-1.5 py-[1px] text-[11px] font-bold uppercase tracking-[0.12em] ${tg.you ? "bg-volt text-ink" : "bg-chalk text-ink"}`}
                        >
                          {tg.text}
                        </span>
                      ))}
                    </span>
                  )}
                  <button
                    type="button"
                    data-option={index}
                    disabled={blocked || isTaken}
                    aria-pressed={mineLocked}
                    onClick={(e) => pick(index, e.currentTarget.querySelector<HTMLElement>("[data-name]"), player.shortName)}
                    onMouseEnter={() => setHover(index)}
                    onMouseLeave={() => setHover((h) => (h === index ? null : h))}
                    className={`group flex h-[62px] w-full items-center gap-3 rounded-[12px] border bg-ink-2 pl-3.5 pr-3 text-left flat:h-[56px] transition-[border-color,background-color,transform,opacity] duration-100 disabled:cursor-default lg:h-[72px] ${
                      mineLocked ? "border-volt" : "border-line enabled:hover:border-chalk/30 enabled:active:scale-[0.99] enabled:active:bg-ink-3"
                    } ${dim ? "opacity-35" : ""}`}
                  >
                    <span className="hidden w-4 text-[11px] font-semibold text-ash lg:block">{displayIdx + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span data-name className={`block truncate font-display text-[23px] font-bold uppercase leading-none tracking-[0.01em] lg:text-[26px] ${isTaken ? "line-through" : ""}`}>
                        {player.name}
                      </span>
                      <span className="mt-1 block truncate text-[12px] text-ash-2">
                        <span className="font-semibold text-chalk/80">{player.positions.map((p) => t(`pos.${p}`)).join(" / ")}</span>
                        {landing?.outOfPosition ? (
                          <span className="font-semibold text-loss"> · {t("draft.oop")}</span>
                        ) : (
                          <span className="text-ash"> · {t(`role.${player.roles[0] ?? "B2B"}`)}</span>
                        )}
                      </span>
                    </span>
                    {slot && landing && (
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        {target === null && preview && (
                          <span
                            className={`rounded-[6px] px-1.5 py-0.5 font-display text-[14px] font-bold leading-none tracking-[0.04em] tnum ${
                              landing.outOfPosition ? "bg-loss/15 text-loss" : slot.position === "GK" && keeperMissing ? "bg-volt text-ink" : "text-ash-2 group-hover:text-volt"
                            }`}
                            title={landing.outOfPosition ? t("draft.wouldOop") : t("draft.wherePlay")}
                          >
                            → {t(`pos.${slot.position}`)}
                            {showRatings && Math.abs(landing.ratingDelta) >= 2 && (
                              <span className="ml-1">{landing.ratingDelta > 0 ? `+${landing.ratingDelta}` : `−${Math.abs(landing.ratingDelta)}`}</span>
                            )}
                          </span>
                        )}
                        {/* The one predicted impact that matters most: a real FIT swing, else what he adds (CREATION ↑). */}
                        {hints && draft.picks.length > 0 && (Math.abs(landing.fitDelta) >= 4 || (!landing.dimUp && Math.abs(landing.fitDelta) >= 2)) ? (
                          <span className={`px-1.5 font-display text-[12.5px] font-bold leading-none tracking-[0.06em] tnum ${landing.fitDelta > 0 ? "text-volt" : "text-loss"}`}>
                            {t("draft.fit").toUpperCase()} {landing.fitDelta > 0 ? `+${landing.fitDelta}` : `−${Math.abs(landing.fitDelta)}`}
                          </span>
                        ) : hints && landing.dimUp ? (
                          <span className="px-1.5 font-display text-[12.5px] font-bold leading-none tracking-[0.06em] text-chalk/75">
                            {t(`dimShort.${landing.dimUp}`)} <span className="text-volt">↑</span>
                          </span>
                        ) : null}
                      </span>
                    )}
                    {showRatings && <span className="w-[42px] shrink-0 text-right font-display text-[34px] font-bold leading-none tnum lg:text-[38px]">{player.overall}</span>}
                  </button>
                  {!hidden && (
                    <button
                      type="button"
                      onClick={() => setInspect(player.id)}
                      data-action="inspect"
                      aria-label={t("inspect.aria", { name: player.name })}
                      className="absolute -right-3 -top-3 z-10 grid size-11 place-items-center rounded-full"
                    >
                      <span aria-hidden className="grid size-6 place-items-center rounded-full border border-chalk/20 bg-ink font-serif text-[12px] font-bold italic text-ash-2 hover:text-chalk">
                        i
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-4 hidden text-[12px] text-ash lg:block">
          {t("draft.keysPick", { keys: `1–${options.length}` })}
          {hasRerolls && (
            <>
              {" · "}
              <kbd className="font-sans text-ash-2">R</kbd> {t("draft.keysReroll")}
            </>
          )}
        </p>
      </section>
      <PlayerSheet
        impact={inspectImpact}
        history={inspect && historyOf ? historyOf(getPlayerEra(inspect).playerId) : null}
        player={inspect ? getPlayerEra(inspect) : null}
        onClose={() => setInspect(null)}
        showRatings={showRatings}
        among={formation.slots.map((sl) => sl.position)}
      />
    </main>
  );
}

function Progress({ round, label }: { round: number; label: string }) {
  return (
    <span className="whitespace-nowrap font-display text-[24px] font-bold leading-none tnum min-[360px]:text-[28px] lg:text-[36px]" aria-label={label}>
      {pad(round)}
      <span className="text-ash"> / 11</span>
    </span>
  );
}

function Clock({ left, total }: { left: number; total: number }) {
  const { t } = useI18n();
  const urgent = left <= 3;
  return (
    <span className="flex items-center gap-1.5" role="timer" aria-label={t("draft.timeLeft", { s: Math.ceil(left) })}>
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-chalk/10">
        <span className={`absolute inset-y-0 left-0 rounded-full ${urgent ? "bg-loss" : "bg-volt"}`} style={{ width: `${(left / total) * 100}%` }} />
      </span>
      <span className={`w-6 font-display text-[20px] font-bold leading-none tnum ${urgent ? "text-loss" : ""}`}>{Math.ceil(left)}</span>
    </span>
  );
}

function FitMeter({ fit }: { fit: number | null }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-1.5" title={t("draft.fitTitle")}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("draft.fit")}</span>
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-chalk/10">
        <span className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-300 ${fit !== null && fit < 70 ? "bg-loss" : "bg-volt"}`} style={{ width: `${fit ?? 0}%` }} />
      </span>
      <span className="w-7 font-display text-[20px] font-bold leading-none tnum">{fit ?? "—"}</span>
    </span>
  );
}

function RerollButton({ available, onReroll }: { available: boolean; onReroll: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onReroll}
      disabled={!available}
      aria-label={available ? t("draft.rerollAria") : t("draft.noRerolls")}
      className="flex h-11 min-w-[52px] items-center justify-center gap-1 rounded-full border border-chalk/15 px-3 font-display text-[18px] font-bold tnum text-chalk transition-colors hover:border-chalk/40 disabled:border-transparent disabled:text-ash"
    >
      <span aria-hidden>↻</span> {available ? 1 : 0}
    </button>
  );
}

/** Post-pick insight: disappears on its own; in DEEP it opens the profile. Never blocks a tap on the options. */
function InsightPill({
  name,
  text,
  tag,
  onOpen,
}: {
  name: string;
  text: string;
  tag?: string | null;
  onOpen?: () => void;
}) {
  const cls = "absolute inset-x-2 bottom-1.5 z-10 mx-auto w-fit max-w-full animate-toast-long rounded-[10px] border border-chalk/10 bg-ink/92 px-3 py-1.5 text-left text-[12.5px] leading-snug text-chalk shadow-lg";
  const body = (
    <>
      <b className="mr-1.5 font-display text-[14px] uppercase tracking-[0.04em] text-chalk">{name}</b>
      {tag && <b className="mr-1.5 font-display text-[14px] uppercase tracking-[0.05em] text-volt">{tag}</b>}
      {text}
      {onOpen && <span className="ml-1 text-ash">›</span>}
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${cls} min-h-11`} role="status">
      {body}
    </button>
  ) : (
    <p className={`pointer-events-none ${cls}`} role="status">
      {body}
    </p>
  );
}
