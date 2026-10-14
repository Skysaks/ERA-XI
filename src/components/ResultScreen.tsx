"use client";

import type { DraftState, SeasonResult } from "@/types";
import { useEffect, useMemo, useRef } from "react";
import { formationOf, getFormation, lineupPlayers, verdictMsgs } from "@/engine";
import { useI18n } from "@/i18n/react";
import { Pitch } from "./Pitch";
import { getClub, getClubEra } from "@/data";
import type { Discovery } from "@/game/collection";
import { nationName } from "@/knowledge/nations";
import { Button, EraMark, HomeButton, Stat, Tag } from "./ui";

export interface RecordContext {
  isBest: boolean;
  previousBest: number | null;
  isModeBest: boolean;
  previousModeBest: number | null;
  dailyAttempt: "official" | "casual" | null;
}

interface ResultProps {
  draft: DraftState;
  result: SeasonResult;
  record: RecordContext | null;
  ptsLabel: boolean;
  rival: string | null;
  onChallenge: () => void;
  onPlayAgain: () => void;
  /** Same seed, new decisions (practice for an already-played Daily). */
  onRunItBack: () => void;
  onAnalysis: () => void;
  onHome: () => void;
  /** Achievements unlocked by this run — shown as one quiet line, never a popup. */
  achievements?: string[];
  /** Replay-from-round practice: labelled, never recorded. */
  practice?: boolean;
  /** XI Gallery: this run is kept in RECENT; the star keeps it for good. */
  favourite?: boolean;
  onFavourite?: () => void;
  /** One discovery moment (new historic era / nationality), never more than one per run. */
  discovery?: Discovery | null;
  /** The biggest turning point Analysis found (only once Analysis has run), for REPLAY FROM ROUND n. */
  turning?: { round: number; pts: number } | null;
  /** Haptic/sound cue once the result is on screen (never during the reveal: no spoilers). */
  onCelebrate?: (cue: "best" | "perfect") => void;
  onReplayFrom?: (round: number) => void;
}

export function ScoreBlock({ result, size = "xl", ptsLabel = false }: { result: SeasonResult; size?: "xl" | "lg"; ptsLabel?: boolean }) {
  const { t } = useI18n();
  const gauntlet = result.format === "gauntlet";
  const gd = result.goalsFor - result.goalsAgainst;
  return (
    <div className="animate-pop">
      <div
        className="whitespace-nowrap font-display font-extrabold leading-[0.82] tnum"
        aria-label={t(gauntlet ? "result.gauntletAria" : "result.aria", { pts: result.points, max: result.maxPoints })}
      >
        {/* Fluid sizes: "104 PTS / 114" must fit a 320px screen without clipping. */}
        <span
          className={
            size === "xl"
              ? `${String(result.points).length >= 3 ? "text-[clamp(78px,24vw,132px)]" : "text-[clamp(96px,32vw,132px)]"} sm:text-[160px] flat:text-[96px]!`
              : String(result.points).length >= 3 ? "text-[clamp(70px,22vw,112px)]" : "text-[clamp(84px,28vw,112px)]"
          }
        >
          {result.points}
        </span>
        {ptsLabel && !gauntlet && <span className={`ml-1 text-chalk ${size === "xl" ? "text-[clamp(26px,9vw,36px)] sm:text-[44px] flat:text-[30px]!" : "text-[clamp(22px,8vw,30px)]"}`}>{t("sim.pts")}</span>}
        <span className={`text-ash ${size === "xl" ? "text-[clamp(32px,11.5vw,46px)] sm:text-[56px] flat:text-[36px]!" : "text-[clamp(28px,10vw,40px)]"}`}> / {result.maxPoints}</span>
      </div>
      {gauntlet ? (
        <div className="mt-3 font-display text-[28px] font-bold uppercase leading-none tracking-[0.03em]">
          {result.losses ? (
            <span className="text-loss">{t("gauntlet.out", { opp: result.matchResults[result.matchResults.length - 1]?.opponent ?? "" })}</span>
          ) : (
            <span className="text-volt">{t("gauntlet.perfect", { max: result.maxPoints })}</span>
          )}
        </div>
      ) : (
        <div className="mt-3 font-display text-[32px] font-bold leading-none tnum">
          {result.wins}
          {t("stat.W")} <span className="text-ash">·</span> {result.draws}
          {t("stat.D")} <span className="text-ash">·</span>{" "}
          <span className={result.losses ? "text-loss" : ""}>
            {result.losses}
            {t("stat.L")}
          </span>
        </div>
      )}
      {!gauntlet && size === "xl" && <SeasonStrip result={result} />}
      <div className="mt-1.5 text-[12px] text-ash tnum">{t("result.goals", { gf: result.goalsFor, ga: result.goalsAgainst, gd: `${gd >= 0 ? "+" : ""}${gd}` })}</div>
    </div>
  );
}

/** The season as a form guide: one mark per matchday (win / draw / defeat), read left to right. */
function SeasonStrip({ result }: { result: SeasonResult }) {
  const { t } = useI18n();
  return (
    <div className="mt-2.5 flex h-[7px] max-w-[420px] gap-[2px]" role="img" aria-label={t("result.formGuide")}>
      {result.matchResults.map((m) => (
        <span key={m.matchday} className={`h-full min-w-0 flex-1 rounded-[1px] ${m.outcome === "W" ? "bg-volt/85" : m.outcome === "D" ? "bg-chalk/35" : "bg-loss/85"}`} />
      ))}
    </div>
  );
}

export function RatingsRow({ result }: { result: SeasonResult }) {
  const { t } = useI18n();
  const r = result.teamRatings;
  return (
    <div className="grid grid-cols-5 gap-1 rounded-[14px] border border-line bg-ink-2 px-2 py-3">
      <Stat label={t("stat.team")} value={r.overall} />
      <Stat label={t("stat.att")} value={r.att} />
      <Stat label={t("stat.mid")} value={r.mid} />
      <Stat label={t("stat.def")} value={r.def} />
      <Stat label={t("stat.fit")} value={r.fit} />
    </div>
  );
}

function RecordLine({ record, result, mode }: { record: RecordContext | null; result: SeasonResult; mode: DraftState["config"]["mode"] }) {
  const { t } = useI18n();
  if (!record) return null;
  const modeLabel = t(`mode.${mode}.name`);
  if (record.isBest) {
    return (
      <p className="mt-3 flex items-center gap-2 text-[13px] text-ash-2 animate-[fade_400ms_500ms_ease-out_both]">
        <Tag tone="volt">{t("result.newBest")}</Tag>
        {record.previousBest !== null && <span className="tnum">{t("result.previous", { n: record.previousBest })}</span>}
      </p>
    );
  }
  const parts: string[] = [];
  if (record.previousBest !== null && result.format === "league") {
    const gap = record.previousBest - result.points;
    parts.push(gap === 0 ? t("result.matchesBest") : t("result.bestGap", { best: record.previousBest, gap }));
  }
  if (mode !== "classic" && record.isModeBest) parts.push(t("result.modeBest", { mode: modeLabel }));
  if (parts.length === 0) return null;
  return <p className="mt-3 text-[13px] text-ash-2 tnum">{parts.join(" · ")}</p>;
}

/** "ELITE CREATION / BUILD-UP WAS YOUR MAIN WEAKNESS" — why the XI performed as it did, + ANALYSE MY XI →. */
export function WhyLine({ result, className = "", onOpen }: { result: SeasonResult; className?: string; onOpen?: () => void }) {
  const { t, m } = useI18n();
  const msgs = useMemo(() => verdictMsgs(result), [result]);
  if (msgs.length === 0 && !onOpen) return null;
  const good = (key: string) => key === "why.elite" || key === "why.strong";
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-3 gap-y-2 ${className}`}>
      <p className="flex min-w-0 flex-col gap-0.5 font-display text-[15px] font-bold uppercase leading-tight tracking-[0.04em]">
        {msgs.map((x) => (
          <span key={x.key} className={`truncate ${good(x.key) ? "text-volt" : "text-ash-2"}`}>
            <span aria-hidden>{good(x.key) ? "▲ " : "▼ "}</span>
            {m(x)}
          </span>
        ))}
      </p>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-chalk/25 px-4 font-display text-[16px] font-bold uppercase tracking-[0.05em] text-chalk hover:border-chalk/50"
        >
          {t("result.analyse")} <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}

export function AchievementLine({ ids }: { ids: string[] }) {
  const { t } = useI18n();
  if (ids.length === 0) return null;
  return (
    <p className="mt-2 text-[12.5px] text-ash-2 animate-[fade_400ms_900ms_ease-out_both]">
      <span className="mr-1.5 text-chalk" aria-hidden>◆</span>
      {t("ach.unlocked", { names: ids.map((id) => t(`ach.${id}.name`)).join(" · ") })}
    </p>
  );
}

export function ResultScreen({ draft, result, record, ptsLabel, rival, onChallenge, onPlayAgain, onRunItBack, onAnalysis, onHome, achievements = [], practice = false, favourite = false, onFavourite, discovery = null, turning = null, onReplayFrom, onCelebrate }: ResultProps) {
  const { t, lang } = useI18n();
  const perfect = result.format === "league" && result.points === result.maxPoints;
  const formation = getFormation(formationOf(draft));
  const dailyRanked = record?.dailyAttempt === "official";
  // "2 PTS FROM YOUR RECORD — TRY AGAIN": the near miss, said with the number.
  const gap = record && !record.isBest && record.previousBest !== null && result.format === "league" ? record.previousBest - result.points : null;
  const nearMiss = gap !== null && gap > 0 && gap <= 5 ? gap : null;
  const celebrated = useRef(false);
  useEffect(() => {
    if (celebrated.current || !onCelebrate || practice) return;
    celebrated.current = true;
    if (perfect) onCelebrate("perfect");
    else if (record?.isBest) onCelebrate("best");
  }, [onCelebrate, perfect, practice, record?.isBest]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 flat:grid flat:grid-cols-2 flat:items-start flat:gap-6 flat:px-[max(16px,env(safe-area-inset-left))] lg:grid lg:grid-cols-[460px_minmax(0,1fr)] lg:items-center lg:gap-14 lg:px-10 lg:py-10">
      <section className="flex flex-col">
        <header className="flex flex-wrap items-center gap-1.5">
          <HomeButton onHome={onHome} className="-ml-2" />
          <button type="button" onClick={onHome} className="mr-1 min-h-11 font-display text-[18px] font-extrabold uppercase tracking-[0.02em] text-chalk max-[359px]:hidden">
            <span className="inline-flex items-center gap-1.5">
              <EraMark size={15} className="text-chalk/70" />
              ERA XI
            </span>
          </button>
          <Tag>{formation.label}</Tag>
          <Tag>{t(`mode.${draft.config.mode}.name`)}</Tag>
          {draft.config.daily && !practice && <Tag>{dailyRanked ? t("result.dailyOfficial") : t("result.dailyCasual")}</Tag>}
          {practice && <Tag>{t("draft.practice")}</Tag>}
          {onFavourite && (
            <button type="button" onClick={onFavourite} aria-pressed={favourite} aria-label={t(favourite ? "gallery.unfavourite" : "gallery.favourite")} className="ml-auto grid size-11 place-items-center rounded-full text-[22px]">
              <span className={favourite ? "text-chalk" : "text-ash"}>{favourite ? "★" : "☆"}</span>
            </button>
          )}
        </header>
        <div className={`mt-5 ${perfect ? "rounded-[16px] border border-volt/70 px-4 pb-3 pt-4" : ""}`}>
          {perfect && (
            <p className="mb-2 flex flex-wrap items-center gap-x-2 font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.08em] text-volt">
              <EraMark size={18} />
              {t("result.perfect")}
              <span className="font-sans text-[12.5px] font-medium normal-case tracking-normal text-ash-2">{t("result.perfectSub")}</span>
            </p>
          )}
          <ScoreBlock result={result} ptsLabel={ptsLabel} />
          <RecordLine record={record} result={result} mode={draft.config.mode} />
          <AchievementLine ids={achievements} />
          {discovery && (
            <p className="mt-2 text-[12.5px] text-ash-2 animate-[fade_400ms_1100ms_ease-out_both]" role="status">
              <span className="mr-1.5 font-semibold uppercase tracking-[0.12em] text-chalk">{t(discovery.kind === "era" ? "discover.era" : "discover.nation")}</span>
              <b className="text-chalk">
                {discovery.kind === "era" ? `${getClub(getClubEra(discovery.id).clubId).name} ${getClubEra(discovery.id).label}` : nationName(discovery.id, lang, t)}
              </b>{" "}
              · {t("discover.added")}
            </p>
          )}
        </div>
        <WhyLine result={result} className="mt-3" />
        {/* Hierarchy: score → why → CHALLENGE → replay → ANALYSE (secondary) → XI. The challenge is in reach on every phone. */}
        <div className="mt-4 flex flex-col gap-2">
          <Actions rival={rival} onChallenge={onChallenge} onPlayAgain={onPlayAgain} onRunItBack={onRunItBack} nearMiss={nearMiss} />
          {turning && onReplayFrom && turning.pts >= 1.5 && (
            <button type="button" data-action="replay-from" onClick={() => onReplayFrom(turning.round)} className="flex min-h-11 items-center justify-between gap-2 rounded-[12px] border border-pitch-line px-4 text-left hover:border-chalk/40">
              <span className="font-display text-[17px] font-bold uppercase tracking-[0.04em] text-chalk">{t("analysis.replayFrom", { n: turning.round })}</span>
              <span className="shrink-0 text-[11.5px] text-ash-2 tnum">{t("result.replayGain", { pts: turning.pts.toFixed(1) })}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onAnalysis}
            data-action="analyse"
            className="flex h-12 items-center justify-between gap-2 rounded-[12px] border border-chalk/20 px-4 text-left hover:border-chalk/45"
          >
            <span className="font-display text-[18px] font-bold uppercase tracking-[0.05em] text-chalk">{t("result.analyse")}</span>
            <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-ash-2">
              <span className="hidden truncate min-[360px]:inline">{t("result.analyseSub")}</span>
              <span className="font-display text-[20px] text-chalk" aria-hidden>
                →
              </span>
            </span>
          </button>
        </div>
        <div className="mt-2">
          <RatingsRow result={result} />
        </div>
      </section>

      <section className="mt-4 flex flex-1 flex-col lg:mt-0">
        <Pitch formation={formation} players={lineupPlayers(draft)} variant="draft" showRatings className="h-[300px] w-full sm:h-[360px] lg:hidden" />
        <Pitch formation={formation} players={lineupPlayers(draft)} variant="full" showRatings className="hidden w-full lg:block lg:[aspect-ratio:0.8] lg:max-h-[80dvh]" />
      </section>
    </main>
  );
}

function Actions({
  rival,
  onChallenge,
  onPlayAgain,
  onRunItBack,
  nearMiss = null,
}: {
  rival: string | null;
  onChallenge: () => void;
  onPlayAgain: () => void;
  onRunItBack: () => void;
  nearMiss?: number | null;
}) {
  const { t } = useI18n();
  return (
    <>
      <Button onClick={onChallenge} className="h-[62px] w-full text-[26px]">
        {rival ? t("result.rematchTo", { name: rival }) : t("result.challenge")}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onPlayAgain} className="h-[54px] min-w-0 flex-col gap-0 whitespace-nowrap px-2! text-[17px] leading-none min-[360px]:text-[19px]">
          {nearMiss ? t("result.tryAgain") : t("result.playAgain")}
          <span className={`mt-1 max-w-full truncate font-sans text-[11px] font-medium normal-case tracking-normal ${nearMiss ? "text-volt" : "text-ash"}`}>{nearMiss ? t("result.nearMiss", { n: nearMiss }) : t("result.newSeed")}</span>
        </Button>
        <Button variant="secondary" onClick={onRunItBack} className="h-[54px] min-w-0 flex-col gap-0 whitespace-nowrap px-2! text-[17px] leading-none min-[360px]:text-[19px]">
          {t("result.runItBack")}
          <span className="mt-1 max-w-full truncate font-sans text-[11px] font-medium normal-case tracking-normal text-ash">{t("result.sameSeed")}</span>
        </Button>
      </div>
    </>
  );
}
