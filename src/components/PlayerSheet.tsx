"use client";

import { useState } from "react";
import type { AttributeKey, PlayerEra, Position } from "@/types";
import { explainRating, positionRatings } from "@/engine";
import { getClub, getClubEra, getPlayerEra } from "@/data";
import { useI18n } from "@/i18n/react";
import { useKnowledge } from "@/knowledge/catalog";
import { nationName } from "@/knowledge/nations";
import { KEEPER_ATTRS, OUTFIELD_ATTRS, bestPositions, playerProfile, schoolIdFor } from "@/knowledge/profile";
import { eraContextLines, useEraContextReady } from "@/knowledge/eraContext";
import { FactLines, RoleSchoolView } from "./KnowledgeViews";
import { Sheet } from "./ui";
import { HelpDot } from "./help";

/** What this pick does to the XI in front of the player (draft option / drafted player). */
export interface TeamImpact {
  fitDelta: number;
  position: Position;
  ratingDelta: number;
  outOfPosition: boolean;
}

/** Local history of one player identity (Passport data; shown only when it exists). */
export interface PlayerHistoryView {
  seen: number;
  drafted: number;
  best: number | null;
  /** The position he played most in your XIs. */
  pos?: string | null;
}

/**
 * PlayerEra profile — optional, never on the path of a standard draft. Order: who and when,
 * WHY the rating (in words), what he would do to YOUR XI, where he can play, the role, facts,
 * other versions, then the model details. Ratings are ERA XI estimates and say so.
 */
export function PlayerSheet({
  player,
  onClose,
  showRatings = true,
  among,
  impact = null,
  history = null,
}: {
  player: PlayerEra | null;
  onClose: () => void;
  /** Football IQ / Mystery: positions and role only while the draft is live. */
  showRatings?: boolean;
  /** Positions to rate him at (the current formation's), best first. */
  among?: readonly Position[];
  impact?: TeamImpact | null;
  history?: PlayerHistoryView | null;
}) {
  const { t, lang } = useI18n();
  const kt = useKnowledge(lang);
  const ctxReady = useEraContextReady();
  const [school, setSchool] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const shown = override ? getPlayerEra(override) : player;
  if (!shown) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const p = shown;
  const close = () => {
    setSchool(null);
    setOverride(null);
    onClose();
  };
  const era = getClubEra(p.clubEraId);
  const club = getClub(era.clubId);
  const rows = positionRatings(p, 5, among);
  const why = explainRating(p);
  const profile = playerProfile(p);
  const keeper = p.positions[0] === "GK";
  const nation = profile.nation && profile.nation.confidence !== "low" ? nationName(profile.nation.code, lang, t) : null;
  const eraCtx = ctxReady && kt ? eraContextLines(kt, era.id, 2) : null;
  const best = bestPositions(p);

  if (school)
    return (
      <Sheet open onClose={close} title={t("know.schoolTitle")}>
        <button type="button" onClick={() => setSchool(null)} className="-ml-1 mb-1 min-h-11 px-1 text-[13px] text-ash-2 hover:text-chalk">
          ← {p.name}
        </button>
        <RoleSchoolView
          initial={school}
          onPlayer={(id) => {
            setSchool(null);
            setOverride(id);
          }}
        />
      </Sheet>
    );

  const chips = (keys: AttributeKey[], tone: string) =>
    keys.map((k) => (
      <span key={k} className={`rounded-[6px] px-1.5 py-0.5 text-[12px] font-semibold ${tone}`}>
        {t(`attr.${k}`)}
        {showRatings && <b className="ml-1 font-display text-[14px] tnum">{p[k]}</b>}
      </span>
    ));

  return (
    <Sheet open onClose={close} title={p.name}>
      <p className="-mt-2 text-[13px] text-ash-2">
        {club.name} · {era.label}
        {nation && <span> · {nation}</span>}
      </p>
      {override && (
        <button type="button" onClick={() => setOverride(null)} className="-ml-1 min-h-11 px-1 text-[12.5px] text-ash-2 hover:text-chalk">
          ← {player?.name}
        </button>
      )}

      {/* PLAYER QUALITY — why the number */}
      <section className="mt-3 rounded-[12px] border border-line bg-ink px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">
            {showRatings ? t("know.whyN", { n: p.overall }) : t("know.profile")}
            <HelpDot id="ratings" />
          </h3>
          {showRatings && <span className="font-display text-[28px] font-bold leading-none tnum">{p.overall}</span>}
        </div>
        {showRatings && profile.why.elite.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-volt">{t("know.elite")}</span>
            {chips(profile.why.elite, "bg-volt/15 text-volt")}
          </p>
        )}
        {showRatings && profile.why.strong.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-chalk">{t("know.strong")}</span>
            {chips(profile.why.strong, "bg-chalk/[0.08] text-chalk")}
          </p>
        )}
        {showRatings && profile.why.limited.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-loss">{t("know.limited")}</span>
            {chips(profile.why.limited, "bg-loss/15 text-loss")}
          </p>
        )}
        <p className="mt-1.5 text-[12px] text-ash-2">
          {t("know.bestPositions")} <b className="font-display text-[15px] tracking-[0.04em] text-chalk">{best.map((x) => t(`pos.${x}`)).join(" · ")}</b>
        </p>
        <button type="button" onClick={() => setSchool(schoolIdFor(p))} className="mt-2 flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-chalk/15 px-3 text-left hover:border-chalk/35">
          <span className="text-[12px] text-ash">{t("know.bestRole")}</span>
          <span className="font-display text-[17px] font-bold uppercase tracking-[0.02em]">
            {t(`role.${profile.role}`)} <span className="text-ash">→</span>
          </span>
        </button>
        {kt && <p className="mt-1.5 text-[13px] leading-snug text-ash-2">{kt(`role.${profile.role}`)}</p>}
        {showRatings && <p className="mt-1.5 text-[11px] leading-snug text-ash">{t("know.modelNote")}</p>}
      </section>

      {/* TEAM IMPACT — the same player can help or hurt YOUR XI */}
      {impact && showRatings && (
        <section className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] border border-line px-3 py-2">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">
            {t("know.teamImpact")}
            <HelpDot id="fit" />
          </span>
          <span className="font-display text-[16px] font-bold tnum">
            → {t(`pos.${impact.position}`)}
            {impact.ratingDelta !== 0 && <span className={impact.ratingDelta < 0 ? "text-loss" : "text-volt"}> {impact.ratingDelta > 0 ? `+${impact.ratingDelta}` : `−${Math.abs(impact.ratingDelta)}`}</span>}
          </span>
          <span className={`font-display text-[16px] font-bold tnum ${impact.fitDelta > 0 ? "text-volt" : impact.fitDelta < 0 ? "text-loss" : "text-ash-2"}`}>
            FIT {impact.fitDelta > 0 ? `+${impact.fitDelta}` : impact.fitDelta < 0 ? `−${Math.abs(impact.fitDelta)}` : "±0"}
          </span>
          <span className="w-full text-[12px] leading-snug text-ash-2">{t(impact.fitDelta < 0 && p.overall >= 90 ? "know.impactStarHurts" : impact.fitDelta > 0 ? "know.impactHelps" : "know.impactNeutral")}</span>
        </section>
      )}

      <section className="mt-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("inspect.positions")}</h3>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <li
              key={r.position}
              className={`flex items-baseline gap-1.5 rounded-[8px] border px-2.5 py-1.5 ${r.kind === "natural" ? "border-volt/60 bg-volt/[0.07]" : r.outOfPosition ? "border-loss/40" : "border-line"}`}
            >
              <b className="font-display text-[17px] font-bold uppercase tracking-[0.04em]">{t(`pos.${r.position}`)}</b>
              {showRatings && <span className="font-display text-[19px] font-bold tnum">{r.rating}</span>}
              {showRatings && r.kind !== "natural" && r.rating < p.overall && <span className="text-[11px] font-semibold text-loss tnum">−{p.overall - r.rating}</span>}
              <span className="text-[11px] text-ash">{t(`inspect.kind.${r.kind}`)}</span>
            </li>
          ))}
        </ul>
        {showRatings && <p className="mt-1.5 text-[11.5px] text-ash">{t("inspect.positionsNote")}</p>}
      </section>

      {(profile.facts.length > 0 || profile.versions.length > 0 || history || eraCtx) && (
        <section className="mt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("know.history")}</h3>
          <FactLines facts={profile.facts} kt={kt} className="mt-1.5" />
          {eraCtx && (
            <p className="mt-1.5 text-[12.5px] leading-snug text-ash-2">
              <span className="font-semibold text-chalk">
                {club.name} {era.label}
              </span>
              {" · "}
              {[eraCtx.honours, eraCtx.coach, eraCtx.style].filter(Boolean).join(" · ")}
            </p>
          )}
          {profile.versions.length > 0 && (
            <div className="mt-2">
              <p className="text-[12px] text-ash">{t("know.versions")}</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {profile.versions.map((v) => {
                  const e = getClubEra(v.clubEraId);
                  return (
                    <li key={v.id}>
                      <button type="button" onClick={() => setOverride(v.id)} className="min-h-11 rounded-[10px] border border-line px-2.5 text-[12.5px] text-chalk hover:border-chalk/30">
                        {getClub(e.clubId).name} {e.label}
                        {showRatings && <b className="ml-1.5 font-display text-[15px] tnum">{v.overall}</b>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {history && history.seen > 0 && (
            <p className="mt-2 text-[12.5px] text-ash-2 tnum">
              {t("know.historyLine", { seen: history.seen, drafted: history.drafted, skipped: Math.max(0, history.seen - history.drafted) })}
              {history.best !== null && <> · {t("know.historyBest", { n: history.best })}</>}
              {history.pos && <> · {t("know.historyPos", { pos: t(`pos.${history.pos}`) })}</>}
            </p>
          )}
        </section>
      )}

      {showRatings ? (
        <details className="mt-3 rounded-[12px] border border-line bg-ink px-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-ash-2 [&::-webkit-details-marker]:hidden">
            {t("know.model")}
            <span aria-hidden>+</span>
          </summary>
          <ul className="flex flex-col gap-1.5 pb-2">
            {(keeper ? KEEPER_ATTRS : OUTFIELD_ATTRS).map((k) => (
              <li key={k} className="grid grid-cols-[104px_1fr_30px] items-center gap-2">
                <span className="truncate text-[12.5px] text-ash-2">{t(`attr.${k}`)}</span>
                <span className="relative h-1.5 rounded-full bg-chalk/[0.07]">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-chalk" style={{ width: `${Math.max(0, Math.min(100, p[k]))}%` }} />
                </span>
                <b className="text-right font-display text-[16px] tnum">{p[k]}</b>
              </li>
            ))}
          </ul>
          <p className="border-t border-line pt-2 text-[13px] leading-snug text-chalk">
            {t("inspect.whyLine", { level: why.level, pos: t(`pos.${why.natural}`), profile: why.profile >= 0 ? `+${why.profile}` : `−${Math.abs(why.profile)}`, n: p.overall })}
          </p>
          <p className="pb-2.5 pt-1.5 text-[11px] text-ash">{t("inspect.estimate")}</p>
        </details>
      ) : (
        <p className="mt-4 text-[12.5px] text-ash-2">{t("inspect.hidden")}</p>
      )}
    </Sheet>
  );
}
