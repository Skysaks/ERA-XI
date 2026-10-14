"use client";

import { useState } from "react";
import type { DraftState, SeasonResult } from "@/types";
import { FORMATIONS, formationOf, getFormation, lineupPlayers, type RivalComparison, type VerifiedChallenge } from "@/engine";
import { useI18n } from "@/i18n/react";
import { Pitch } from "./Pitch";
import { WhyLine } from "./ResultScreen";
import { Button, HomeButton, Tag, Wordmark } from "./ui";
import { ERA_BUCKET_LABEL, getClub } from "@/data";

export function ChallengeIntro({
  challenge,
  onPlay,
  onFresh,
  onHome,
  ptsLabel = true,
}: {
  challenge: VerifiedChallenge;
  onPlay: () => void;
  onFresh: () => void;
  onHome: () => void;
  ptsLabel?: boolean;
}) {
  const { t } = useI18n();
  const who = challenge.creatorName ?? t("ch.yourFriend");
  const p = challenge.payload;
  const r = challenge.creatorResult;
  const draw = challenge.creatorState.draw;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4">
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          <HomeButton onHome={onHome} className="-ml-2" />
          <Wordmark className="text-[26px]" />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Tag>{FORMATIONS[p.f].label}</Tag>
          <Tag>{t(`mode.${p.m}.name`)}</Tag>
          {draw.bucket && <Tag>{t(`bucket.${draw.bucket}`) || ERA_BUCKET_LABEL[draw.bucket]}</Tag>}
          {draw.clubId && <Tag>{getClub(draw.clubId).name}</Tag>}
          {draw.league && <Tag>{t(`league.${draw.league}`)}</Tag>}
          {p.w && <Tag>{t(`weekly.${p.w}.name`)}</Tag>}
          {p.d && <Tag>{t("mode.daily.name")} {p.d.slice(5)}</Tag>}
        </div>
      </header>
      <section className="flex flex-1 flex-col justify-center py-10 short:py-4">
        <p className="font-display text-[30px] font-bold uppercase tracking-[0.03em] text-ash-2 short:text-[24px]">{t("ch.scored", { who })}</p>
        {/* Fluid: "104 PTS / 114" on one line from 320px up. */}
        <p className="mt-1 whitespace-nowrap font-display font-extrabold leading-[0.85] tnum animate-pop">
          <span className={String(r.points).length >= 3 ? "text-[clamp(78px,25vw,150px)]" : "text-[clamp(96px,33vw,150px)]"}>{r.points}</span>
          {ptsLabel && r.format === "league" && <span className="ml-1 text-[clamp(26px,9vw,40px)] text-chalk">{t("sim.pts")}</span>}
          <span className="text-[clamp(32px,12vw,54px)] text-ash"> / {r.maxPoints}</span>
        </p>
        <p className="mt-8 font-display text-[40px] font-extrabold uppercase leading-[0.95] short:mt-4 short:text-[32px]">
          {t("ch.same")}
          <br />
          <span className="text-volt">{t("ch.beat")}</span>
        </p>
        <p className="mt-4 max-w-[360px] text-[14px] text-ash-2 short:mt-2 short:text-[13px]">{t("ch.explain")}</p>
      </section>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-gradient-to-t from-ink from-75% to-transparent px-4 pb-[max(8px,env(safe-area-inset-bottom))] pt-3">
        <Button onClick={onPlay} className="h-[68px] w-full text-[28px]">
          {t("ch.playSame")}
        </Button>
        <Button variant="ghost" onClick={onFresh} className="w-full">
          {t("ch.fresh")}
        </Button>
      </div>
    </main>
  );
}

interface RivalResultProps {
  challenge: VerifiedChallenge;
  draft: DraftState;
  result: SeasonResult;
  comparison: RivalComparison;
  record: { you: number; them: number; draws: number } | null;
  onRematch: () => void;
  onShare: () => void;
  onPlayAgain: () => void;
  /** Same challenge again (same seed, same target) — new decisions. */
  onRunItBack: () => void;
  onHome: () => void;
}

export function RivalResult({ challenge, draft, result, comparison, record, onRematch, onShare, onPlayAgain, onRunItBack, onHome }: RivalResultProps) {
  const { t, m } = useI18n();
  const [view, setView] = useState<"you" | "them">("you");
  const name = challenge.creatorName ?? t("ch.yourFriend");
  const formation = getFormation(formationOf(draft));
  const verdict = comparison.outcome === "win" ? t("ch.youWin") : comparison.outcome === "loss" ? t("ch.theyWin", { name }) : t("ch.deadHeat");
  const margin = Math.abs(comparison.yourScore - comparison.theirScore);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 lg:grid lg:grid-cols-[440px_minmax(0,1fr)] lg:items-start lg:gap-14 lg:px-10 lg:py-10">
      <section className="flex flex-col">
        <span className="flex items-center gap-1">
          <HomeButton onHome={onHome} className="-ml-2" />
          <Wordmark className="text-[22px]" />
        </span>
        <div className="mt-5 grid grid-cols-2 gap-3 animate-pop">
          <ScoreCell label={t("common.you")} value={comparison.yourScore} highlight={comparison.outcome === "win"} />
          <ScoreCell label={name} value={comparison.theirScore} highlight={comparison.outcome === "loss"} />
        </div>
        <p
          className={`mt-4 font-display text-[44px] font-extrabold uppercase leading-none ${
            comparison.outcome === "win" ? "text-volt" : comparison.outcome === "loss" ? "text-loss" : "text-chalk"
          }`}
        >
          {verdict}
        </p>
        <p className="mt-1 text-[13px] text-ash-2 tnum">
          {comparison.outcome === "draw" ? t("ch.level") : t("ch.by", { n: margin })}{" "}
          {result.format === "league" && t("ch.youWent", { w: result.wins, d: result.draws, l: result.losses })}
          {record && (
            <>
              {" "}
              {t("ch.h2h")} <b className="text-chalk">{t("common.you")} {record.you}</b> – <b className="text-chalk">{record.them} {name}</b>
            </>
          )}
        </p>

        {comparison.decisive?.impact && (
          <p className="mt-5 rounded-[12px] border border-volt/40 bg-volt/[0.06] px-3.5 py-2.5 text-[13.5px] leading-snug">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-volt">{t("ch.decisive", { n: comparison.decisive.round })}</span>
            {comparison.decisive.impact.pts > 0
              ? t("ch.decisiveUp", { yours: comparison.decisive.yours, theirs: comparison.decisive.theirs, pts: `+${comparison.decisive.impact.pts}` })
              : t("ch.decisiveDown", { yours: comparison.decisive.yours, theirs: comparison.decisive.theirs, pts: Math.abs(comparison.decisive.impact.pts) })}
          </p>
        )}

        <h2 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("ch.split")}</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {comparison.differences.map((d) => (
            <li key={d.round} className="rounded-[12px] border border-line bg-ink-2 px-3.5 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("ch.round", { n: d.round, context: d.context })}</div>
              <div className="mt-1 grid grid-cols-2 gap-2 font-display text-[19px] font-bold uppercase leading-tight">
                <span>
                  <span className="block font-sans text-[11px] font-medium normal-case tracking-normal text-ash">{t("ch.theyChose", { name })}</span>
                  {d.theirs}
                </span>
                <span>
                  <span className="block font-sans text-[11px] font-medium normal-case tracking-normal text-ash">{t("ch.youChose")}</span>
                  {d.yours}
                </span>
              </div>
              {d.impact && <ImpactChips impact={d.impact} />}
            </li>
          ))}
          {comparison.differences.length === 0 && <li className="text-[14px] text-ash-2">{t("ch.identical")}</li>}
        </ul>
        <ul className="mt-3 flex flex-col gap-1">
          {comparison.summaryMsgs.map((s) => (
            <li key={s.key} className="text-[14px] font-medium">
              {m(s)}
            </li>
          ))}
        </ul>
        <WhyLine result={result} className="mt-3" />
        {challenge.payload.x && (
          // Viral rule: a received challenge is always free; the premium rules are only named afterwards.
          <button type="button" onClick={onPlayAgain} className="mt-4 self-start text-left text-[12.5px] text-ash-2 underline-offset-2 hover:underline">
            {t("plus.usedCustom")} <span className="text-chalk">{t("plus.createOwn")} →</span>
          </button>
        )}

        <div className="mt-5 hidden flex-col gap-2 lg:flex">
          <RivalActions name={name} onRematch={onRematch} onShare={onShare} onPlayAgain={onPlayAgain} onRunItBack={onRunItBack} />
        </div>
      </section>

      <section className="mt-5 flex flex-col lg:mt-0">
        <div className="mb-2 flex gap-1 self-start rounded-full bg-chalk/[0.06] p-1" role="tablist">
          {(["you", "them"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`h-11 rounded-full px-4 font-display text-[16px] font-bold uppercase tracking-[0.04em] ${view === v ? "bg-chalk text-ink" : "text-ash-2"}`}
            >
              {v === "you" ? t("ch.yourXI") : t("ch.theirXI", { name })}
            </button>
          ))}
        </div>
        <Pitch
          formation={view === "you" ? formation : getFormation(formationOf(challenge.creatorState))}
          players={lineupPlayers(view === "you" ? draft : challenge.creatorState)}
          variant="draft"
          showRatings
          className="h-[320px] w-full sm:h-[380px] lg:h-auto lg:[aspect-ratio:0.8] lg:max-h-[74dvh]"
        />
        <div className="h-44 lg:hidden" aria-hidden />
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 bg-gradient-to-t from-ink via-ink to-ink/0 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-8 lg:hidden">
          <RivalActions name={name} onRematch={onRematch} onShare={onShare} onPlayAgain={onPlayAgain} onRunItBack={onRunItBack} />
        </div>
      </section>
    </main>
  );
}

/** One side's season score, always read against the maximum (/ 114): the number that decides. */
export function ScoreCell({ label, value, highlight, max = 114 }: { label: string; value: number; highlight: boolean; max?: number }) {
  return (
    <div className={`rounded-[14px] border px-4 py-3 ${highlight ? "border-volt/60 bg-volt/[0.06]" : "border-line bg-ink-2"}`}>
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{label}</div>
      <div className="whitespace-nowrap font-display font-extrabold leading-[0.9] tnum">
        <span className="text-[72px] max-[359px]:text-[60px]">{value}</span>
        <span className="ml-1 text-[22px] text-ash">/ {max}</span>
      </div>
    </div>
  );
}

function RivalActions({
  name,
  onRematch,
  onShare,
  onPlayAgain,
  onRunItBack,
}: {
  name: string;
  onRematch: () => void;
  onShare: () => void;
  onPlayAgain: () => void;
  onRunItBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <Button onClick={onRematch} className="h-[62px] w-full text-[26px]">
        {t("ch.rematch")}
      </Button>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={onShare} className="h-[52px] min-w-0 whitespace-nowrap px-1! text-[15px]! tracking-[0.02em]!">
          {t("ch.share")}
        </Button>
        <Button variant="secondary" onClick={onRunItBack} className="h-[52px] min-w-0 whitespace-nowrap px-1! text-[15px]! tracking-[0.02em]!">
          {t("result.runItBack")}
        </Button>
        <Button variant="secondary" onClick={onPlayAgain} className="h-[52px] min-w-0 whitespace-nowrap px-1! text-[15px]! tracking-[0.02em]!">
          {t("ch.newDraft")}
        </Button>
      </div>
      <p className="text-center text-[11.5px] text-ash">{t("ch.rematchNote", { name })}</p>
    </>
  );
}

function signed(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
}

/** How your pick (vs. theirs) moved your own XI, everything else held equal. */
export function ImpactChips({ impact }: { impact: { att: number; mid: number; def: number; fit: number; pts: number } }) {
  const { t } = useI18n();
  const axes: [string, number][] = [
    [t("stat.att"), impact.att],
    [t("stat.mid"), impact.mid],
    [t("stat.def"), impact.def],
    [t("stat.fit"), impact.fit],
  ];
  const shown = axes.filter(([, v]) => Math.abs(v) >= 1);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {shown.map(([k, v]) => (
        <span key={k} className={`rounded-[5px] px-1.5 py-0.5 font-display text-[13px] font-bold uppercase tracking-[0.05em] tnum ${v > 0 ? "bg-volt/15 text-volt" : "bg-loss/15 text-loss"}`}>
          {k} {signed(v)}
        </span>
      ))}
      <span className={`ml-auto font-display text-[15px] font-bold tnum ${impact.pts > 0 ? "text-volt" : impact.pts < 0 ? "text-loss" : "text-ash"}`}>
        {signed(impact.pts)} {t("sim.pts")}
      </span>
    </div>
  );
}
