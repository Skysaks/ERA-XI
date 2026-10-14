"use client";

import { useEffect, useMemo, useState } from "react";
import type { DraftState, FormationId } from "@/types";
import {
  RULESETS,
  applyProjection,
  changeFormation,
  destinationsFor,
  draftRatings,
  explainFit,
  formationFlexible,
  currentProjection,
  formationIdsFor,
  formationOf,
  formationProjection,
  getFormation,
  healthCheck,
  lineupPlayers,
  optimiseFrom,
  type Projection,
  teamSheet,
  type TeamSheet,
} from "@/engine";
import { getPlayerEra } from "@/data";
import { useI18n } from "@/i18n/react";
import { Pitch } from "./Pitch";
import { PlayerSheet } from "./PlayerSheet";
import { FormationNote } from "./KnowledgeViews";
import { BrandStamp, Button, HomeButton, Sheet, Stat, Tag } from "./ui";
import { HelpLink } from "./help";

interface Props {
  draft: DraftState;
  selectedSlot: number | null;
  onTapSlot: (i: number) => void;
  onSimulate: () => void;
  onHome: () => void;
  /** Formation change / OPTIMISE XI / undo — applied only when the player taps. */
  onSetDraft: (d: DraftState) => void;
  onClearSelection: () => void;
}

const signed = (n: number, digits = 0) => (n > 0 ? `+${n.toFixed(digits)}` : n < 0 ? `−${Math.abs(n).toFixed(digits)}` : "±0");

/**
 * Every formation's projection for this XI, computed after first paint one formation per task
 * (each is a Hungarian arrangement + an exact season expectation), so a phone never janks.
 * Expected points stay internal: they rank options, they are never shown before the season.
 */
function useProjections(draft: DraftState) {
  const [state, setState] = useState<{ draft: DraftState; before: Projection; options: Projection[]; done: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ids = formationIdsFor(draft);
    const options: Projection[] = [];
    let i = 0;
    let timer = 0;
    const step = () => {
      if (cancelled) return;
      const id = ids[i++];
      if (id) options.push(formationProjection(draft, id));
      const done = i >= ids.length;
      if (done || i % 4 === 0) setState({ draft, before: currentProjection(draft), options: options.slice(), done });
      if (!done) timer = window.setTimeout(step, 0);
    };
    timer = window.setTimeout(step, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft]);
  return state && state.draft === draft ? state : null;
}

export function XIComplete({ draft, selectedSlot, onTapSlot, onSimulate, onHome, onSetDraft, onClearSelection }: Props) {
  const { t, m } = useI18n();
  const formation = getFormation(formationOf(draft));
  const players = lineupPlayers(draft);
  const r = useMemo(() => draftRatings(draft), [draft]);
  // TEAM SHEET: identity, structural players and game plan, read from these eleven (presentation only).
  const sheetRead = useMemo(() => teamSheet(players, formation, draft.config.engineVersion), [players, formation, draft.config.engineVersion]);
  const gauntlet = RULESETS[draft.config.mode].seasonType === "gauntlet";
  const flexible = formationFlexible(draft);
  const issues = useMemo(() => healthCheck(draft), [draft]);
  const severe = issues.find((i) => i.severity === "severe") ?? null;
  const [sheet, setSheet] = useState<null | "formation" | "fit" | "optimise" | "plan">(null);
  const [undo, setUndo] = useState<DraftState | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const destinations = useMemo(() => (selectedSlot === null ? null : destinationsFor(draft, selectedSlot)), [draft, selectedSlot]);
  const selected = selectedSlot !== null ? players[selectedSlot] : null;
  const proj = useProjections(draft);
  const options = proj?.options ?? [];
  const optimisation = proj?.done ? optimiseFrom(proj.before, proj.options) : null;
  const current = formationOf(draft);
  const bestOption = proj?.done ? proj.options.reduce<Projection | null>((a, b) => (!a || b.expected > a.expected ? b : a), null) : null;
  // The FORMATION → action names a better shape only when one is clearly better for these eleven.
  const betterShape = bestOption && bestOption.formation !== current && proj && (bestOption.fit > proj.before.fit || bestOption.expected - proj.before.expected >= 0.5) ? bestOption : null;
  const fitItems = useMemo(() => (sheet === "fit" ? explainFit(players, formation, draft.config.engineVersion) : null), [sheet, players, formation, draft.config.engineVersion]);

  const apply = (next: DraftState) => {
    setUndo(draft);
    onSetDraft(next);
    setSheet(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 flat:grid flat:grid-cols-2 flat:items-start flat:gap-4 flat:px-[max(12px,env(safe-area-inset-left))] lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-12 lg:px-10 lg:py-8">
      <section className="flex min-h-0 flex-1 flex-col">
        <header className="mb-2 flex items-center gap-2 px-1 lg:mb-4">
          <HomeButton onHome={onHome} className="-ml-2" />
          <h1 className="font-display text-[28px] font-extrabold uppercase leading-none tracking-[0.01em]">{t("xi.title")}</h1>
          <Tag>{formation.label}</Tag>
          <span className="ml-auto">
            <Tag>{t(`mode.${draft.config.mode}.name`)}</Tag>
          </span>
        </header>
        <div className="relative">
          <Pitch
            formation={formation}
            players={players}
            variant="full"
            showRatings
            selectedSlot={selectedSlot}
            destinations={destinations}
            onSlotClick={onTapSlot}
            links={selected ? null : sheetRead.connections.map((c) => c.slots)}
            className="w-full animate-[fade_300ms_ease-out_both] [aspect-ratio:0.78] max-h-[56dvh] short:max-h-[50dvh] flat:max-h-[calc(100dvh-84px)] lg:max-h-[80dvh] lg:[aspect-ratio:0.72]"
          />
          <BrandStamp className="top-3">{t("xi.complete")}</BrandStamp>
        </div>
        {/* Below the pitch, never over it: every slot stays tappable while a player is selected. */}
        {selected ? (
          <div className="mt-2 flex h-12 items-center gap-2 rounded-[12px] border border-volt/50 bg-ink pl-3">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ash-2">
              <b className="font-display text-[16px] uppercase text-chalk">{selected.shortName}</b> · {t("move.hint")}
            </span>
            <button type="button" onClick={() => setInspect(selected.id)} className="h-11 shrink-0 rounded-full border border-chalk/20 px-3 text-[12px] font-semibold text-chalk" aria-label={t("inspect.open")}>
              {t("inspect.short")}
            </button>
            <button type="button" onClick={onClearSelection} className="grid size-11 shrink-0 place-items-center text-ash hover:text-chalk" aria-label={t("common.close")}>
              ✕
            </button>
          </div>
        ) : (
          // The most serious XI check item takes the hint line: seen on the smallest phone without scrolling.
          <p className={`mt-2 flex h-12 items-center justify-center px-1 text-center ${severe ? "text-[13.5px] font-semibold text-loss" : "text-[12px] text-ash"}`}>
            {severe ? (
              <>
                <span aria-hidden>▲&nbsp;</span>
                {m({ key: `health.${severe.id}`, params: severe.params })}
              </>
            ) : (
              t("xi.swapHint")
            )}
          </p>
        )}

      </section>

      <section className="flex flex-col gap-3 pt-3 flat:pt-1 lg:pt-0">
        <button
          type="button"
          onClick={() => setSheet("fit")}
          className="grid grid-cols-6 gap-1 rounded-[14px] border border-line bg-ink-2 px-2 py-3 text-left hover:border-chalk/25 lg:grid-cols-3 lg:gap-y-5 lg:py-5"
          aria-label={t("fitx.open")}
        >
          <Stat label={t("stat.att")} value={r.att} />
          <Stat label={t("stat.mid")} value={r.mid} />
          <Stat label={t("stat.def")} value={r.def} />
          <Stat label={t("stat.gk")} value={r.gk} />
          <Stat label={`${t("stat.fit")} ⓘ`} value={r.fit} accent={r.fit >= 90} />
          <Stat label={t("stat.ovr")} value={r.overall} />
        </button>

        {issues.some((i) => i.severity === "severe") ? (
          <div className={`rounded-[12px] border px-3 py-2.5 ${issues.some((i) => i.severity === "severe") ? "border-loss/40 bg-loss/[0.06]" : "border-line bg-ink"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("health.title")}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {issues.slice(0, 3).map((i) => (
                <li key={i.id} className={`text-[13px] font-medium leading-snug ${i.severity === "severe" ? "text-loss" : "text-ash-2"}`}>
                  <span aria-hidden>{i.severity === "severe" ? "▲ " : "△ "}</span>
                  {m({ key: `health.${i.id}`, params: i.params })}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setSheet("optimise")} className="mt-2 h-11 min-w-[44px] rounded-full bg-chalk px-4 font-display text-[16px] font-bold uppercase tracking-[0.04em] text-ink">
              {t("optimise.cta")}
              {optimisation && <span className="ml-1.5 font-sans text-[12px] font-semibold normal-case tracking-normal tnum">{optimiseSummary(optimisation.before, optimisation.after)}</span>}
            </button>
          </div>
        ) : (
          // The team sheet's reading of the XI: style, strength, weakness — then who carries it.
          <div className="px-1" data-testid="identity">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("tac.identity")}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {sheetRead.identity.map((k, i) => (
                <li key={k} className={`flex items-center gap-2 font-medium ${i === 0 ? "font-display text-[19px] font-bold uppercase leading-tight tracking-[0.02em]" : "text-[14.5px]"}`}>
                  {i > 0 && (
                    <span className={`font-display text-[15px] font-bold ${k.startsWith("tac.weak") ? "text-loss" : "text-volt"}`} aria-hidden>
                      {k.startsWith("tac.weak") ? "↓" : "↑"}
                    </span>
                  )}
                  {t(k)}
                </li>
              ))}
            </ul>
            {issues.length > 0 && (
              // Mild XI-check items stay visible, with the fix one tap away.
              <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ash-2">
                <span className="min-w-0 flex-1 truncate">
                  <span aria-hidden>△ </span>
                  {m({ key: `health.${issues[0]!.id}`, params: issues[0]!.params })}
                </span>
                <button type="button" onClick={() => setSheet("optimise")} className="min-h-11 shrink-0 px-1 font-display text-[14px] font-bold uppercase tracking-[0.04em] text-chalk underline-offset-2 hover:underline">
                  {t("optimise.cta")} →
                </button>
              </p>
            )}
            {sheetRead.keyPlayers.length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-ash-2">
                {sheetRead.keyPlayers.map((k) => (
                  <span key={k.kind}>
                    <span className="font-semibold uppercase tracking-[0.08em] text-ash">{t(`tac.key.${k.kind}`)}</span> <b className="text-chalk">{k.name}</b>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
        {undo && (
          <button type="button" onClick={() => { onSetDraft(undo); setUndo(null); }} className="self-start px-1 text-[12.5px] text-ash-2 underline-offset-2 hover:underline">
            ↶ {t("optimise.undo")}
          </button>
        )}
        <div className={`grid gap-2 ${flexible ? "grid-cols-1 min-[360px]:grid-cols-[1.35fr_1fr]" : "grid-cols-1"}`}>
          {flexible && (
            <button
              type="button"
              onClick={() => setSheet("formation")}
              data-action="formation"
              className="flex h-12 min-w-0 items-center gap-2 rounded-[12px] border border-chalk/20 px-3 text-left hover:border-chalk/40 active:bg-ink-3"
              aria-label={t("formation.change")}
            >
              <span className="shrink-0 font-display text-[17px] font-bold uppercase tracking-[0.04em]">{t("xi.formationCta")}</span>
              {betterShape && (
                <span className="ml-auto truncate font-display text-[15px] font-bold tracking-[0.03em] tnum text-volt">
                  {getFormation(betterShape.formation).label}
                  {betterShape.fit > r.fit ? " ↑" : ""}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSheet("plan")}
            data-action="gameplan"
            className="flex h-12 min-w-0 items-center justify-between gap-1 rounded-[12px] border border-chalk/20 px-3 text-left hover:border-chalk/40 active:bg-ink-3"
          >
            <span className="truncate font-display text-[17px] font-bold uppercase tracking-[0.04em] max-[380px]:text-[15px] max-[380px]:tracking-[0.01em]">{t("tac.planCta")}</span>
            <span aria-hidden>→</span>
          </button>
        </div>
        {/* Mobile: the season CTA stays in reach whatever the scroll. */}
        <div className="sticky bottom-0 z-10 -mx-3 mt-auto bg-gradient-to-t from-ink from-70% to-transparent px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-3 lg:static lg:mx-0 lg:bg-none lg:px-0 lg:pb-0">
          <Button onClick={onSimulate} className="h-[60px] w-full text-[26px]">
            {gauntlet ? t("xi.gauntlet") : t("xi.simulate")}
          </Button>
        </div>
      </section>

      <Sheet open={sheet === "formation"} onClose={() => setSheet(null)} title={t("formation.title")}>
        <p className="-mt-1 mb-1 text-[12.5px] text-ash-2">{t("formation.note")}</p>
        <HelpLink id="formations" label={t("help.formationsLink")} />
        <ul className="flex flex-col gap-1" aria-busy={!proj?.done}>
          {options
            .slice()
            .sort((a, b) => b.expected - a.expected)
            .map((o) => {
              const isCurrent = o.formation === current;
              const best = proj?.done && o === bestOption;
              return (
                <li key={o.formation}>
                  <button
                    type="button"
                    disabled={isCurrent}
                    onClick={() => apply(changeFormation(draft, o.formation as FormationId))}
                    className={`grid min-h-[48px] w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[10px] border px-3 py-2 text-left ${isCurrent ? "border-chalk/50 bg-chalk/[0.05]" : "border-line bg-ink hover:border-chalk/30"}`}
                  >
                    <span className="font-display text-[20px] font-bold tracking-[0.03em]">
                      {getFormation(o.formation).label}
                      {isCurrent && <span className="ml-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-ash-2">{t("formation.current")}</span>}
                      {best && !isCurrent && <span className="ml-2 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-volt">{t("formation.best")}</span>}
                    </span>
                    <span className={`text-[12px] tnum ${o.outOfPosition ? "text-loss" : "text-ash"}`}>{o.outOfPosition ? t("formation.oop", { n: o.outOfPosition }) : ""}</span>
                    <span className="w-[74px] text-right font-display text-[17px] font-bold tnum">
                      FIT {o.fit}
                      {o.fit > r.fit && <span className="text-volt"> ↑</span>}
                      {o.fit < r.fit && <span className="text-loss"> ↓</span>}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
        <FormationNote formation={current} className="mt-3" />
        <p className="mt-2 text-[11px] text-ash">{t("formation.estimate")}</p>
      </Sheet>

      <Sheet open={sheet === "optimise"} onClose={() => setSheet(null)} title={t("optimise.title")}>
        {optimisation ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 rounded-[12px] border border-line bg-ink px-3 py-3 text-center">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">FIT</div>
                <div className="font-display text-[22px] font-bold tnum">
                  {optimisation.before.fit} → <span className="text-volt">{optimisation.after.fit}</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t("stat.overall")}</div>
                <div className="font-display text-[22px] font-bold tnum">
                  {optimisation.before.overall} → {optimisation.after.overall}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t("optimise.oop")}</div>
                <div className="font-display text-[22px] font-bold tnum">
                  {optimisation.before.outOfPosition} → <span className="text-volt">{optimisation.after.outOfPosition}</span>
                </div>
              </div>
            </div>
            {optimisation.formationChanged && (
              <p className="text-[13.5px] text-chalk">{t("optimise.formation", { from: getFormation(optimisation.before.formation).label, to: getFormation(optimisation.after.formation).label })}</p>
            )}
            <p className="text-[12.5px] text-ash-2">
              {t("optimise.moves", {
                n: optimisation.after.lineup.filter((id, i) => id !== draft.lineup[i]).length,
              })}
            </p>
            <Button onClick={() => apply(applyProjection(draft, optimisation.after))} className="h-[54px] w-full text-[20px]">
              {t("optimise.apply")}
            </Button>
            <p className="text-[11px] text-ash">{t("optimise.note")}</p>
          </div>
        ) : (
          <p className="text-[13.5px] text-ash-2">{proj?.done ? t("optimise.none") : "…"}</p>
        )}
      </Sheet>

      <Sheet open={sheet === "plan"} onClose={() => setSheet(null)} title={t("tac.plan")}>
        <GamePlanView read={sheetRead} />
      </Sheet>

      <Sheet open={sheet === "fit"} onClose={() => setSheet(null)} title={t("fitx.title", { n: r.fit })}>
        <HelpLink id="fit" label={t("help.fitLink")} />
        {fitItems && (
          <ul className="flex flex-col">
            <li className="flex justify-between border-b border-line py-1.5 text-[13px] text-ash">
              <span>{t("fitx.start")}</span>
              <b className="font-display text-[16px] tnum">100</b>
            </li>
            {fitItems.items.map((it, i) => (
              <li key={`${it.key}-${i}`} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[13px]">
                <span className="min-w-0">{m({ key: it.key, params: it.params })}</span>
                <b className={`shrink-0 font-display text-[16px] tnum ${it.delta > 0 ? "text-volt" : "text-loss"}`}>{signed(Math.round(it.delta * 10) / 10, Number.isInteger(Math.round(it.delta * 10) / 10) ? 0 : 1)}</b>
              </li>
            ))}
            <li className="flex justify-between py-1.5 text-[13.5px] font-semibold">
              <span>FIT</span>
              <b className="font-display text-[18px] tnum">{fitItems.fit}</b>
            </li>
          </ul>
        )}
        <p className="mt-2 text-[11px] text-ash">{t("fitx.note")}</p>
      </Sheet>

      <PlayerSheet player={inspect ? getPlayerEra(inspect) : null} onClose={() => setInspect(null)} among={formation.slots.map((s) => s.position)} />
    </main>
  );
}

/** What OPTIMISE changes, in visible units only (FIT, out-of-position count, overall) — never points before the season. */
function optimiseSummary(before: Projection, after: Projection): string {
  if (after.fit !== before.fit) return `FIT ${before.fit} → ${after.fit}`;
  if (after.outOfPosition !== before.outOfPosition) return `OOP ${before.outOfPosition} → ${after.outOfPosition}`;
  return `OVR ${before.overall} → ${after.overall}`;
}

/** YOUR GAME PLAN — four phases, the identity, the structural players and the connections, all read from the XI. */
export function GamePlanView({ read }: { read: TeamSheet }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5">
        {read.plan.map((p) => (
          <div key={p.phase} className="contents">
            <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t(`tac.phase.${p.phase}`)}</dt>
            <dd className="font-display text-[18px] font-bold uppercase leading-tight tracking-[0.02em]">{t(p.key, p.params)}</dd>
          </div>
        ))}
      </dl>
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("tac.identity")}</p>
        <ul className="mt-1 flex flex-col gap-0.5 text-[14px]">
          {read.identity.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        {read.keyPlayers.length > 0 && (
          <ul className="mt-2 flex flex-col gap-0.5 text-[13.5px]">
            {read.keyPlayers.map((k) => (
              <li key={k.kind} className="flex justify-between border-b border-line py-1">
                <span className="text-ash-2">{t(`tac.key.${k.kind}`)}</span>
                <b className="font-display text-[16px] uppercase">{k.name}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
      {read.connections.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("tac.connections")}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {read.connections.map((c) => (
              <li key={c.id} className="text-[13.5px]">
                <b className="font-display text-[15px] uppercase tracking-[0.03em] text-chalk">{t(`tac.c.${c.id}`)}</b> <span className="text-ash-2">· {c.players.join(" + ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-[11.5px] text-ash">{t("tac.readNote")}</p>
    </div>
  );
}
