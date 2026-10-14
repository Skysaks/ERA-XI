"use client";

import type { DraftState, SeasonResult } from "@/types";
import { useEffect, useMemo, useState } from "react";
import { DIMENSIONS, DIM_RULES, analyseRun, expectedSeason, explainFit, formationOf, getFormation, lineupPlayers, tacticalConnections, turningPoints } from "@/engine";
import { useI18n } from "@/i18n/react";
import { Button, Sheet } from "./ui";
import { HelpDot } from "./help";
import { decisionSummary } from "@/game/decisions";

/** ANALYSE MY XI — loaded on demand (and prefetched when idle), never on the first paint. */
export default function AnalysisSheet({
  open,
  onClose,
  result,
  draft,
  onRunItBack,
  onReplayFrom,
  onTurning,
}: {
  open: boolean;
  onClose: () => void;
  result: SeasonResult;
  draft: DraftState;
  onRunItBack?: () => void;
  /** Practice: replay the same draft from this round (1-based). Never official. */
  onReplayFrom?: (round: number) => void;
  /** Reports the biggest turning point once computed (the Result can then offer REPLAY FROM ROUND n). */
  onTurning?: (x: { round: number; pts: number } | null) => void;
}) {
  const { t, m } = useI18n();
  const [showAllTurning, setShowAllTurning] = useState(false);
  const [full, setFull] = useState(false);
  const r = result.teamRatings;
  const summary = open ? analyseRun(draft, result) : null;
  const gauntlet = result.format === "gauntlet";
  // Post-game only (the draft is over): computed lazily when the sheet opens.
  const reconsider = useMemo(() => (open && draft.picks.length === 11 ? turningPoints(draft) : []), [open, draft]);
  useEffect(() => {
    if (open) onTurning?.(reconsider[0] ? { round: reconsider[0].round, pts: reconsider[0].pts } : null);
  }, [open, reconsider, onTurning]);
  const expectation = useMemo(() => (open && !gauntlet ? expectedSeason(r, draft.config.seed, draft.config.engineVersion) : null), [open, gauntlet, r, draft.config.seed, draft.config.engineVersion]);
  const verdict = expectation ? (result.points > expectation.high ? "above" : result.points < expectation.low ? "below" : "within") : null;
  const decisions = useMemo(() => {
    if (!open || draft.picks.length !== 11) return null;
    try {
      return decisionSummary(draft);
    } catch {
      return null;
    }
  }, [open, draft]);
  // FIRST LAYER — what worked, what cost points, the turning point. Everything else is one tap away.
  const layer = useMemo(() => {
    if (!open || !summary) return null;
    const lineup = lineupPlayers(draft);
    const f = getFormation(formationOf(draft));
    const worked = [
      ...tacticalConnections(lineup, f).map((c) => t(`tac.c.${c.id}`)),
      ...summary.strengths.map((s) => t(`dim.${s.dim}`)),
    ].slice(0, 3);
    const weakBySynergy: Record<string, string> = { transition: "tac.weak.transitions", narrowLeft: "tac.weak.narrowLeft", narrowRight: "tac.weak.narrowRight", narrow: "tac.weak.narrow", slowLine: "tac.weak.slowLine", noBallWinner: "tac.weak.noBallWinner", sameSpace: "tac.weak.sameSpace" };
    const cost = [
      ...(summary.positional.length ? [t("analysis.oopShort", { n: summary.positional.length })] : []),
      ...(r.synergies ?? []).filter((s) => s.delta < 0 && weakBySynergy[s.id]).map((s) => t(weakBySynergy[s.id]!)),
      ...summary.weaknesses.map((w) => t(`dim.${w.dim}`)),
    ].slice(0, 3);
    return { worked, cost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, summary?.explanation, draft, r]);
  const fitItems = useMemo(() => (open ? explainFit(lineupPlayers(draft), getFormation(formationOf(draft)), draft.config.engineVersion).items.slice(0, 5) : []), [open, draft]);
  return (
    <Sheet open={open} onClose={onClose} title={gauntlet ? t("analysis.title") : t("analysis.why", { n: result.points })}>
      {layer && (
        <section className="flex flex-col gap-3" data-testid="analysis-first">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-volt">{t("analysis.worked")}</h3>
              <ul className="mt-1 flex flex-col gap-0.5 text-[14.5px] font-medium leading-snug">
                {layer.worked.length ? layer.worked.map((x) => <li key={x}>+ {x}</li>) : <li className="text-ash">{t("analysis.noStandout")}</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-loss">{t("analysis.cost")}</h3>
              <ul className="mt-1 flex flex-col gap-0.5 text-[14.5px] font-medium leading-snug">
                {layer.cost.length ? layer.cost.map((x) => <li key={x}>− {x}</li>) : <li className="text-ash">{t("analysis.nothingBelow")}</li>}
              </ul>
            </div>
          </div>
          {reconsider[0] && (
            <div className="rounded-[12px] border border-line bg-ink px-3 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("analysis.turning")}</h3>
              <p className="mt-0.5 font-display text-[18px] font-bold uppercase leading-tight tracking-[0.02em]">
                {t("analysis.turningLine", { n: reconsider[0].round, took: reconsider[0].took, instead: reconsider[0].instead })}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ash-2 tnum">
                {t("analysis.estPts", { pts: `+${reconsider[0].pts.toFixed(1)}` })}
                {Math.abs(reconsider[0].fit) >= 1 && ` · FIT ${reconsider[0].fit > 0 ? "+" : "−"}${Math.abs(reconsider[0].fit)}`}
              </p>
            </div>
          )}
          {expectation && verdict && (
            <p className="text-[12.5px] text-ash-2 tnum">
              {t("analysis.expected")} {expectation.low}–{expectation.high} ·{" "}
              <b className={verdict === "above" ? "text-volt" : verdict === "below" ? "text-loss" : "text-chalk"}>{t(`analysis.verdict.${verdict}`)}</b>
            </p>
          )}
          <button
            type="button"
            data-action="full-analysis"
            onClick={() => setFull((v) => !v)}
            aria-expanded={full}
            className="flex h-12 items-center justify-between rounded-[12px] border border-chalk/20 px-4 font-display text-[17px] font-bold uppercase tracking-[0.04em] hover:border-chalk/40 active:bg-ink-3"
          >
            {full ? t("analysis.lessDetail") : t("analysis.full")}
            <span aria-hidden>{full ? "↑" : "→"}</span>
          </button>
        </section>
      )}
      {full && summary && (
        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("analysis.whyResult")}</h3>
          {expectation && verdict && (
            <div className="grid grid-cols-[1fr_1fr_1.3fr] items-center gap-2 rounded-[12px] border border-line bg-ink px-3 py-2.5">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t("analysis.expected")}</div>
                <div className="font-display text-[22px] font-bold tnum">
                  {expectation.low}–{expectation.high}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t("analysis.result")}</div>
                <div className="font-display text-[22px] font-bold tnum">{result.points}</div>
              </div>
              <div className={`font-display text-[15px] font-bold uppercase leading-tight tracking-[0.03em] ${verdict === "above" ? "text-volt" : verdict === "below" ? "text-loss" : "text-chalk"}`}>
                {t(`analysis.verdict.${verdict}`)}
              </div>
              <p className="col-span-3 text-[11px] text-ash">{t("analysis.expectedNote", { exp: expectation.expected.toFixed(0) })}</p>
            </div>
          )}
          <p className="text-[15px] leading-snug text-chalk">{summary.explanationMsgs.map(m).join(" ")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[12px] border border-line bg-ink px-3 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("analysis.strongest")}</h3>
              <ul className="mt-1.5 flex flex-col gap-1">
                {summary.strengths.length ? (
                  summary.strengths.map((s) => (
                    <li key={s.dim} className="flex items-baseline justify-between gap-2 text-[13.5px]">
                      <span>{t(`dim.${s.dim}`)}</span>
                      <b className="font-display text-[17px] text-volt tnum">{s.value}</b>
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-ash">{t("analysis.noStandout")}</li>
                )}
              </ul>
            </div>
            <div className="rounded-[12px] border border-line bg-ink px-3 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("analysis.weakest")}</h3>
              <ul className="mt-1.5 flex flex-col gap-1">
                {summary.weaknesses.length ? (
                  summary.weaknesses.map((w) => (
                    <li key={w.dim} className="flex items-baseline justify-between gap-2 text-[13.5px]">
                      <span>{t(`dim.${w.dim}`)}</span>
                      <b className="font-display text-[17px] text-loss tnum">{w.value}</b>
                    </li>
                  ))
                ) : (
                  <li className="text-[13px] text-ash">{t("analysis.nothingBelow")}</li>
                )}
              </ul>
            </div>
          </div>
          {summary.positional.length > 0 && (
            <div className="rounded-[12px] border border-loss/25 bg-loss/[0.06] px-3 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-loss">{t("analysis.positional")}</h3>
              <ul className="mt-1.5 flex flex-col gap-1">
                {summary.positional.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-2 text-[13.5px] tnum">
                    <span>
                      {p.name} <span className="text-ash">· {t("analysis.playing", { natural: t(`pos.${p.natural}`), slot: t(`pos.${p.slot}`) })}</span>
                    </span>
                    <b className="font-display text-[16px] text-loss">{p.ratingDelta}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fitItems.length > 0 && (
            <div className="rounded-[12px] border border-line bg-ink px-3 py-2.5">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">
                {t("analysis.fitBehind", { n: r.fit })}
                <HelpDot id="fit" />
              </h3>
              <ul className="mt-1.5 flex flex-col gap-1">
                {fitItems.map((it, i) => (
                  <li key={`${it.key}-${i}`} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="min-w-0">{m({ key: it.key, params: it.params })}</span>
                    <b className={`shrink-0 font-display text-[15px] tnum ${it.delta > 0 ? "text-volt" : "text-loss"}`}>
                      {it.delta > 0 ? "+" : "−"}
                      {Math.abs(Math.round(it.delta * 10) / 10)}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {reconsider.length > 0 && (
            <div className="rounded-[12px] border border-line bg-ink px-3 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("analysis.keyPick")}</h3>
              <ul className="mt-1 flex flex-col divide-y divide-line">
                {(showAllTurning ? reconsider : reconsider.slice(0, 1)).map((x) => (
                  <li key={x.round} className="py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("analysis.roundN", { n: x.round })}</div>
                    <div className="mt-0.5 grid grid-cols-2 gap-2 font-display text-[17px] font-bold uppercase leading-tight">
                      <span className="min-w-0 truncate">
                        <span className="block font-sans text-[11px] font-medium normal-case tracking-normal text-ash">{t("analysis.you")}</span>
                        {x.took}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="block font-sans text-[11px] font-medium normal-case tracking-normal text-ash">{t("analysis.alternative")}</span>
                        {x.instead}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          ["FIT", x.fit],
                          ...x.dims.map((d) => [t(`dimShort.${d.dim}`), d.delta] as [string, number]),
                          [t("stat.att"), x.att],
                          [t("stat.def"), x.def],
                        ] as [string, number][]
                      )
                        .filter(([, v]) => Math.abs(v) >= 1)
                        .slice(0, 4)
                        .map(([k, v]) => (
                          <span key={k} className={`rounded-[5px] px-1.5 py-0.5 font-display text-[12.5px] font-bold uppercase tracking-[0.05em] tnum ${v > 0 ? "bg-volt/15 text-volt" : "bg-loss/15 text-loss"}`}>
                            {k} {v > 0 ? `+${v}` : `−${Math.abs(v)}`}
                          </span>
                        ))}
                      <span className="ml-auto text-[12px] text-chalk tnum">{t("analysis.estPts", { pts: `+${x.pts.toFixed(1)}` })}</span>
                    </div>
                    {onReplayFrom && (
                      <button type="button" onClick={() => onReplayFrom(x.round)} className="mt-0.5 flex min-h-11 items-center text-[12.5px] font-semibold text-ash-2 underline-offset-2 hover:text-chalk hover:underline">
                        {t("analysis.replayFrom", { n: x.round })} →
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {reconsider.length > 1 && (
                <button type="button" onClick={() => setShowAllTurning(!showAllTurning)} className="flex min-h-11 items-center text-[12px] font-semibold uppercase tracking-[0.12em] text-ash-2 hover:text-chalk">
                  {showAllTurning ? t("analysis.fewerTurning") : t("analysis.moreTurning", { n: reconsider.length - 1 })}
                </button>
              )}
              <p className="mt-1 text-[11px] text-ash">{t("analysis.turningNote")}</p>
              {onRunItBack && (
                <Button variant="secondary" onClick={onRunItBack} className="mt-2 h-[46px] w-full text-[18px]">
                  {t("result.runItBack")}
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {full && decisions && (
        <details className="group mt-4 border-t border-line pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-ash-2 [&::-webkit-details-marker]:hidden">
            {t("decide.title")}
            <span className="font-display text-[18px] transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <div className="mb-1 rounded-[12px] border border-line bg-ink px-3 py-2.5">
            <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
              {(
                [
                  ["decide.star", `decide.level.${decisions.starPower}`],
                  ["decide.balance", `decide.grade.${decisions.balance}`],
                  ["decide.discipline", `decide.grade.${decisions.discipline}`],
                  ["decide.risk", `decide.level.${decisions.risk}`],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2">
                  <dt className="text-ash-2">{t(k)}</dt>
                  <dd className="font-display text-[15px] font-bold uppercase tracking-[0.03em]">{t(v)}</dd>
                </div>
              ))}
            </dl>
            {decisions.line && <p className="mt-2 text-[13px] leading-snug text-chalk">{t(decisions.line.key, decisions.line.params)}</p>}
          </div>
        </details>
      )}
      {full && (
      <>
      <details className="group mt-2 border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-ash-2 [&::-webkit-details-marker]:hidden">
          {t("analysis.profile")}
          <span className="font-display text-[18px] transition-transform group-open:rotate-45" aria-hidden>
            +
          </span>
        </summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {DIMENSIONS.map((d) => {
            const v = r.dims[d];
            const th = DIM_RULES[d].threshold;
            const weak = v < th;
            return (
              <li key={d} className="grid grid-cols-[112px_1fr_32px] items-center gap-2">
                <span className="truncate font-display text-[15px] font-bold tracking-[0.04em] text-ash-2">{t(`dimShort.${d}`)}</span>
                <span className="relative h-2 rounded-full bg-chalk/[0.07]">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${weak ? "bg-loss" : "bg-chalk"}`} style={{ width: `${Math.min(100, v)}%` }} />
                  <span className="absolute -top-0.5 h-3 w-px bg-volt" style={{ left: `${th}%` }} title={t("analysis.threshold")} />
                </span>
                <span className={`text-right font-display text-[17px] font-bold tnum ${weak ? "text-loss" : ""}`}>{v}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11.5px] text-ash">
          {t("analysis.tickNote")} {r.outOfPosition > 0 && t("analysis.oopCount", { n: r.outOfPosition })} {r.overlap > 0 && t("analysis.overlap", { n: r.overlap })}
        </p>
      </details>

      <details className="group mt-2 border-t border-line pt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-ash-2 [&::-webkit-details-marker]:hidden">
          {gauntlet ? t("gauntlet.run") : t("analysis.matches")}
          <span className="font-display text-[18px] transition-transform group-open:rotate-45" aria-hidden>
            +
          </span>
        </summary>
        <ol className="mt-2 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          {result.matchResults.map((x) => (
            <li key={x.matchday} className="flex h-8 items-center gap-2 border-b border-line text-[13px]">
              <span className="w-6 text-ash tnum">{x.matchday}</span>
              {!gauntlet && <span className="w-4 text-[11px] text-ash">{x.home ? t("sim.home") : t("sim.away")}</span>}
              <span className="min-w-0 flex-1 truncate">{x.opponent}</span>
              <span className="font-display text-[16px] font-bold tnum">
                {x.goalsFor}–{x.goalsAgainst}
                {x.penalties && <span className="ml-1 text-[12px] text-ash-2">({x.penalties[0]}–{x.penalties[1]})</span>}
              </span>
              <span
                className={`grid size-5 place-items-center rounded-[4px] font-display text-[12px] font-bold ${
                  x.outcome === "W" ? "bg-chalk text-ink" : x.outcome === "D" ? "bg-ash text-ink" : "bg-loss text-ink"
                }`}
              >
                {t(`stat.${x.outcome}`)}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11.5px] text-ash">{gauntlet ? t("analysis.gauntletNote") : t("analysis.matchesNote")}</p>
      </details>
      </>
      )}
    </Sheet>
  );
}
