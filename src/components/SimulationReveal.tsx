"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchResult, SeasonEvent, SeasonResult } from "@/types";
import { cumulativeRecord } from "@/engine";
import { useI18n } from "@/i18n/react";
import { EraMark, HomeButton, useReducedMotion } from "./ui";
import { seasonMilestones, type Milestone } from "@/game/milestones";

const DURATION = 3200;

/** Presentation only — the season (or gauntlet run) was computed before this mounted. */
export function SimulationReveal({
  result,
  onDone,
  onSkip,
  onHome,
  ptsLabel = false,
  speed = "live",
  personalBest = null,
}: {
  result: SeasonResult;
  onDone: () => void;
  onSkip: (matchday: number) => void;
  onHome: () => void;
  /** Spell out "PTS" while the 114-point scale is new to the player. */
  ptsLabel?: boolean;
  /** Settings → simulation presentation. "instant" never mounts this screen. */
  speed?: "live" | "fast" | "instant";
  /** Best score before this season (personal-best pace milestone). */
  personalBest?: number | null;
}) {
  const { t } = useI18n();
  const gauntlet = result.format === "gauntlet";
  const total = result.matchResults.length;
  const steps = useMemo(() => cumulativeRecord(result), [result]);
  const reduced = useReducedMotion();
  const [md, setMd] = useState(reduced ? total : 0);
  const mdRef = useRef(md);
  const doneRef = useRef(false);
  // A gauntlet has at most 10 matches: slower, one at a time.
  const base = gauntlet ? Math.max(1400, total * 520) : DURATION;
  const duration = speed === "fast" ? Math.round(base * 0.35) : base;

  useEffect(() => {
    if (reduced) {
      const tm = setTimeout(onDone, 400);
      return () => clearTimeout(tm);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = gauntlet ? p : 1 - Math.pow(1 - p, 2.2);
      const next = Math.max(1, Math.round(eased * total));
      if (next !== mdRef.current) {
        mdRef.current = next;
        setMd(next);
      }
      if (p < 1) raf = requestAnimationFrame(tick);
      else if (!doneRef.current) {
        doneRef.current = true;
        setTimeout(onDone, gauntlet ? 700 : 350);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = steps[Math.max(0, md - 1)] ?? { w: 0, d: 0, l: 0, pts: 0 };
  const match = md > 0 ? result.matchResults[md - 1] : undefined;
  // Milestones: at most two prominent moments (the rarest). Without any, a few small match beats.
  const milestones = useMemo(() => seasonMilestones(result, personalBest), [result, personalBest]);
  const beats = useMemo(() => (milestones.length ? [] : result.events.slice(0, 3)), [milestones.length, result.events]);
  const [beat, setBeat] = useState<SeasonEvent | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const shown = useRef(new Set<string>());
  // Hide timers live outside the effect: the effect re-runs on every matchday, and a cleanup that
  // cancelled them left a beat on screen for the rest of the season ("MD 1 · first defeat" at MD 20).
  const hideTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => hideTimers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const ms = [...milestones].reverse().find((x) => x.matchday <= md && !shown.current.has(`m${x.kind}`));
    if (ms) {
      shown.current.add(`m${ms.kind}`);
      setMilestone(ms);
      if (ms.kind === "perfect") return; // stays until the result
      hideTimers.current.push(setTimeout(() => setMilestone((b) => (b === ms ? null : b)), 1300));
      return;
    }
    // Only while it is still news: a beat the counter has already run past by 4+ matchdays is skipped.
    const e = [...beats].reverse().find((x) => x.matchday <= md && !shown.current.has(`e${x.matchday}`));
    if (!e) return;
    shown.current.add(`e${e.matchday}`);
    if (md - e.matchday > 3) return;
    setBeat(e);
    hideTimers.current.push(setTimeout(() => setBeat((b) => (b === e ? null : b)), 1000));
  }, [md, milestones, beats]);

  const score = gauntlet ? cur.w : cur.pts;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-1">
          <HomeButton onHome={onHome} className="-ml-2" />
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ash">
            {!gauntlet && (md >= total ? <EraMark size={12} className="text-chalk/80" /> : <span className="size-1.5 rounded-full bg-loss" aria-hidden />)}
            {gauntlet ? t("gauntlet.title") : md <= 2 ? t("sim.kickoff") : md >= total ? t("sim.fullTime") : t("sim.title")}
          </span>
        </span>
        <span className="font-display text-[18px] font-bold text-ash-2 tnum">
          {gauntlet ? (
            t("gauntlet.legend", { n: Math.max(1, md), max: result.maxPoints })
          ) : (
            <>
              {t("sim.md")} {String(md).padStart(2, "0")}
              <span className="text-ash"> / {total}</span>
            </>
          )}
        </span>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center" aria-live="off">
        <div className="whitespace-nowrap font-display font-extrabold leading-none tnum">
          <span className="text-[128px] sm:text-[160px]">{score}</span>
          {ptsLabel && !gauntlet && <span className="ml-1 text-[34px] text-chalk sm:text-[42px]">{t("sim.pts")}</span>}
          <span className="text-[44px] text-ash sm:text-[56px]"> / {result.maxPoints}</span>
        </div>
        {gauntlet ? (
          <p className="mt-2 font-display text-[26px] font-bold uppercase tracking-[0.06em] text-ash-2">{t("gauntlet.beaten")}</p>
        ) : (
          <div className="mt-4 flex gap-6 font-display text-[40px] font-bold leading-none tnum">
            <span>
              {cur.w}
              <span className="text-[22px] text-ash">{t("stat.W")}</span>
            </span>
            <span>
              {cur.d}
              <span className="text-[22px] text-ash">{t("stat.D")}</span>
            </span>
            <span className={cur.l > 0 ? "text-loss" : ""}>
              {cur.l}
              <span className="text-[22px] text-ash">{t("stat.L")}</span>
            </span>
          </div>
        )}

        <div className="mt-8 flex h-[58px] w-full max-w-[520px] flex-col items-center justify-start gap-1.5">
          {match && (
            <p className="flex w-full items-baseline justify-center gap-2 font-display text-[19px] font-bold uppercase leading-none tracking-[0.03em] tnum">
              <span className="shrink-0 text-[13px] text-ash">{gauntlet ? `${match.matchday}/${result.maxPoints}` : `${t("sim.md")} ${match.matchday}`}</span>
              {/* A fixture line, home side first: "ERA XI 2–0 MILAN · 1989" / "BARCELONA · 2011 2–2 ERA XI". */}
              <Fixture match={match} neutral={gauntlet} />
            </p>
          )}
          {match?.penalties && (
            <span className="font-display text-[14px] font-bold uppercase tracking-[0.06em] text-ash-2 tnum">{t("gauntlet.pens", { a: match.penalties[0], b: match.penalties[1] })}</span>
          )}
          {milestone ? (
            <span
              key={milestone.kind}
              className={`animate-pop font-display font-extrabold uppercase leading-none tracking-[0.04em] ${milestone.kind === "perfect" ? "text-[30px] text-volt" : milestone.kind === "firstDefeat" ? "text-[22px] text-loss" : milestone.kind === "pointsDropped" ? "text-[22px] text-chalk" : "text-[22px] text-volt"}`}
              role="status"
            >
              {t(`milestone.${milestone.kind}`, milestone.params)}
            </span>
          ) : beat && (
            <span
              key={beat.matchday}
              className={`animate-rise rounded-[6px] px-2 py-[3px] font-display text-[14px] font-bold uppercase tracking-[0.06em] ${beat.kind === "first_defeat" ? "bg-loss text-ink" : "bg-volt text-ink"}`}
            >
              {t("sim.md")} {beat.matchday} · {t(`event.${beat.kind}`, beat.params)}
            </span>
          )}
        </div>

        <div
          className="mt-4 grid w-full max-w-[520px] gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${gauntlet ? result.maxPoints : total}, minmax(0, 1fr))` }}
          aria-hidden
        >
          {(gauntlet ? Array.from({ length: result.maxPoints }, (_, i) => result.matchResults[i]) : result.matchResults).map((m, i) => (
            <span
              key={i}
              className={`${gauntlet ? "h-9" : "h-7"} rounded-[2px] transition-colors duration-150 ${
                !m || i >= md ? "bg-chalk/[0.06]" : m.outcome === "W" ? "bg-chalk" : m.outcome === "D" ? "bg-ash" : "bg-loss"
              }`}
            />
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            doneRef.current = true;
            onSkip(md);
          }}
          className="h-12 rounded-full px-5 font-display text-[19px] font-bold uppercase tracking-[0.08em] text-chalk ring-1 ring-chalk/20 hover:ring-chalk/50"
        >
          {t("sim.skip")}
        </button>
      </div>
    </main>
  );
}

function opponentLabel(name: string): string {
  const m = /^(.*\S)\s+(\d{4})$/.exec(name);
  return m ? `${m[1]} · ${m[2]}` : name;
}

function Fixture({ match, neutral }: { match: MatchResult; neutral: boolean }) {
  const tone = match.outcome === "W" ? "text-volt" : match.outcome === "L" ? "text-loss" : "text-chalk";
  const home = neutral || match.home;
  const opp = <span className="min-w-0 truncate">{opponentLabel(match.opponent)}</span>;
  const score = (
    <span className={`shrink-0 ${tone}`}>
      {home ? match.goalsFor : match.goalsAgainst}–{home ? match.goalsAgainst : match.goalsFor}
    </span>
  );
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {home ? <span className="shrink-0">ERA XI</span> : opp}
      {score}
      {home ? opp : <span className="shrink-0">ERA XI</span>}
    </span>
  );
}
