"use client";

import { useMemo, useState } from "react";
import { ERA_BUCKETS, getFormation } from "@/engine";
import type { FormationId } from "@/types";
import { DATA_STATS, allNationalities, getClub, getClubEra, getPlayer, hasClubEra, playerIdOf } from "@/data";
import { preferredPosition } from "@/game/collection";
import { useKnowledge } from "@/knowledge/catalog";
import { eraContextLines } from "@/knowledge/eraContext";
import type { StoredProfile } from "@/game/storage";
import { ACHIEVEMENTS } from "@/game/achievements";
import { DNA_MIN_GAMES, draftDNA } from "@/game/dna";
import { useI18n } from "@/i18n/react";

/**
 * ERA PASSPORT — what you have explored of football history. Counts only; no packs,
 * no currency, nothing to buy. Everything is derived from real drafts on this device.
 */
export function PassportView({ profile, onSchool }: { profile: StoredProfile; onSchool?: () => void }) {
  const { t, lang } = useI18n();
  const kt = useKnowledge(lang);
  const [allEras, setAllEras] = useState(false);
  const p = profile.passport;
  const stats = useMemo(() => {
    const safe = <T,>(f: () => T, d: T) => {
      try {
        return f();
      } catch {
        return d;
      }
    };
    const players = new Set(p.seenPlayerEras.map((id) => safe(() => playerIdOf(id), id)));
    const teams = p.clubs.map((id) => safe(() => getClub(id), null));
    const clubs = teams.filter((c) => c?.kind === "club").length;
    const nations = teams.filter((c) => c && c.kind !== "club").length;
    const buckets = new Set(p.eras.map((e) => safe(() => getClubEra(e).bucket, null)).filter(Boolean));
    return { players: players.size, clubs, nations, buckets: buckets.size };
  }, [p]);
  const nationalities = useMemo(() => allNationalities().length, []);
  // Player history: the players you meet most, and what you did with them.
  const met = useMemo(
    () =>
      Object.entries(profile.history)
        .sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1])
        .slice(0, 6)
        .map(([id, row]) => ({ id, name: getPlayer(id)?.name ?? id, seen: row[0], drafted: row[1], best: row[2], pos: preferredPosition(row) })),
    [profile.history],
  );
  // ERAS DISCOVERED — newest first, with how much of each squad you have met, and its context.
  const eras = useMemo(() => {
    const seen = new Set(p.seenPlayerEras);
    return [...p.eras]
      .reverse()
      .filter(hasClubEra)
      .map((id) => {
        const e = getClubEra(id);
        const met = e.playerEraIds.filter((x) => seen.has(x)).length;
        return { id, name: getClub(e.clubId).name, label: e.label, pct: Math.round((met / Math.max(1, e.playerEraIds.length)) * 100) };
      });
  }, [p.eras, p.seenPlayerEras]);

  const fmt = (n: number) => n.toLocaleString(lang);
  const rows: [string, number, number][] = [
    [t("passport.players"), stats.players, DATA_STATS.players],
    [t("passport.playerEras"), p.seenPlayerEras.length, DATA_STATS.playerEras],
    [t("passport.teams"), p.eras.length, DATA_STATS.eras],
    [t("passport.clubs"), stats.clubs, DATA_STATS.clubs],
    [t("passport.nations"), stats.nations, DATA_STATS.teams - DATA_STATS.clubs],
    [t("passport.nationalities"), p.nations.length, nationalities],
    [t("passport.eras"), stats.buckets, ERA_BUCKETS.length],
  ];
  const dna = draftDNA(profile.dna);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] leading-snug text-ash-2">{t("passport.intro")}</p>
      <section className="flex flex-col gap-2.5">
        {rows.map(([label, n, total]) => (
          <div key={label}>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{label}</span>
              <span className="font-display text-[22px] font-bold leading-none tnum">
                {fmt(n)} <span className="text-[15px] text-ash">/ {fmt(total)}</span>
              </span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-chalk/[0.07]">
              <div className="h-full rounded-full bg-chalk/60" style={{ width: `${Math.min(100, (n / Math.max(1, total)) * 100)}%` }} />
            </div>
          </div>
        ))}
        <p className="text-[11.5px] text-ash">{t("passport.drafted", { n: fmt(p.players.length) })}</p>
      </section>

      {eras.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("passport.erasTitle")}</h3>
          <ul className="mt-1">
            {(allEras ? eras : eras.slice(0, 6)).map((e) => {
              const ctx = kt ? eraContextLines(kt, e.id, 2) : null;
              return (
                <li key={e.id} className="border-b border-line py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-display text-[17px] font-bold uppercase tracking-[0.02em]">
                      {e.name} <span className="text-ash-2">{e.label}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ash-2 tnum">{t("passport.discoveredPct", { n: e.pct })}</span>
                  </div>
                  <div className="mt-1 h-0.5 rounded-full bg-chalk/[0.07]">
                    <div className="h-full rounded-full bg-volt/70" style={{ width: `${e.pct}%` }} />
                  </div>
                  {ctx && (
                    <p className="mt-1 text-[12px] leading-snug text-ash-2">
                      {[ctx.honours, ctx.coach, ctx.style].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {eras.length > 6 && (
            <button type="button" onClick={() => setAllEras(!allEras)} className="mt-1 flex min-h-11 items-center text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ash-2 hover:text-chalk">
              {allEras ? t("passport.fewerEras") : t("passport.allEras", { n: eras.length })}
            </button>
          )}
        </section>
      )}

      {met.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("passport.met")}</h3>
          <ul className="mt-1">
            {met.map((m) => (
              <li key={m.id} className="grid grid-cols-[1fr_auto] items-baseline gap-2 border-b border-line py-2">
                <span className="min-w-0 truncate font-display text-[17px] font-bold uppercase">
                  {m.name}
                  {m.pos && <span className="ml-1.5 font-sans text-[11px] font-semibold tracking-[0.08em] text-ash">{t(`pos.${m.pos}`)}</span>}
                </span>
                <span className="text-[12px] text-ash-2 tnum">
                  {t("passport.metLine", { seen: m.seen, drafted: m.drafted, skipped: Math.max(0, m.seen - m.drafted) })}
                  {m.best !== null && <b className="ml-1.5 font-display text-[15px] text-chalk">{m.best}</b>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onSchool && (
        <button type="button" onClick={onSchool} className="flex min-h-12 items-center justify-between rounded-[12px] border border-chalk/15 px-4 text-left hover:border-chalk/35">
          <span className="font-display text-[18px] font-bold uppercase tracking-[0.04em]">{t("know.schoolTitle")}</span>
          <span className="text-[12px] text-ash-2">{t("passport.schoolSub")} →</span>
        </button>
      )}

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("passport.achievements")}</h3>
        <ul className="mt-2 flex flex-col">
          {ACHIEVEMENTS.map((a) => {
            const at = profile.achievements[a.id];
            return (
              <li key={a.id} className={`flex items-baseline justify-between gap-3 border-b border-line py-2 ${at ? "" : "opacity-45"}`}>
                <span className="min-w-0">
                  <span className="font-display text-[17px] font-bold uppercase tracking-[0.03em]">
                    <span className={at ? "text-volt" : "text-ash"} aria-hidden>
                      {at ? "◆ " : "◇ "}
                    </span>
                    {t(`ach.${a.id}.name`)}
                  </span>
                  <span className="block text-[12px] text-ash-2">{t(`ach.${a.id}.desc`)}</span>
                </span>
                <span className="shrink-0 text-[11px] text-ash tnum">{at ? new Date(at).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" }) : t("passport.locked")}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("dna.title")}</h3>
        {dna?.football && <FootballDNAView fd={dna.football} />}
        {dna ? (
          <div className="mt-2 flex flex-col gap-1.5 text-[13.5px]">
            {(
              [
                ["dna.star", dna.starBias],
                ["dna.fit", dna.fitPriority],
                ["dna.attack", dna.attackBias],
                ["dna.defence", dna.defenceBias],
                ["dna.creator", dna.creatorBias],
                ["dna.reroll", dna.rerollRate],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[1fr_120px_40px] items-center gap-2">
                <span className="text-ash-2">{t(k)}</span>
                <span className="h-1.5 rounded-full bg-chalk/[0.07]">
                  <span className="block h-full rounded-full bg-volt" style={{ width: pct(Math.max(0, Math.min(1, v))) }} />
                </span>
                <b className="text-right font-display text-[16px] tnum">{pct(v)}</b>
              </div>
            ))}
            <p className="mt-1 text-[12px] text-ash-2">
              {t("dna.eras")}: <span className="text-chalk">{dna.topBuckets.map((b) => t(`bucket.${b}`)).join(" · ")}</span>
            </p>
            <p className="text-[12px] text-ash-2">
              {t("dna.clubs")}: <span className="text-chalk">{dna.topClubs.map((c) => getClub(c).name).join(" · ")}</span>
            </p>
            <p className="text-[12px] text-ash-2">
              {t("dna.oop")}: <span className="text-chalk tnum">{dna.outOfPositionRisk.toFixed(1)}</span>
            </p>
            <p className="mt-1 text-[11.5px] text-ash">{t("dna.note", { n: dna.games })}</p>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-ash-2">{t("dna.locked", { n: Math.min(profile.dna.length, DNA_MIN_GAMES), min: DNA_MIN_GAMES })}</p>
        )}
      </section>
    </div>
  );
}

/** FOOTBALL DNA — an archetype and six football axes, all from the XIs actually built. */
function FootballDNAView({ fd }: { fd: import("@/game/dna").FootballDNA }) {
  const { t } = useI18n();
  const axes: [string, number][] = [
    ["controlVertical", fd.axes.controlVertical],
    ["possessionTransition", fd.axes.possessionTransition],
    ["technicalPhysical", fd.axes.technicalPhysical],
    ["widthCentral", fd.axes.widthCentral],
    ["starFit", fd.axes.starFit],
    ["riskBalance", fd.axes.riskBalance],
  ];
  return (
    <div className="mt-2 rounded-[12px] border border-line bg-ink px-3 py-3" data-testid="football-dna">
      <p className="font-display text-[26px] font-extrabold uppercase leading-none tracking-[0.02em] text-volt">{t(`dna.arch.${fd.archetype}`)}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-ash-2">{t(`dna.archSub.${fd.archetype}`)}</p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
        {fd.formation && (
          <div>
            <dt className="text-ash">{t("dna.prefFormation")}</dt>
            <dd className="font-display text-[16px] font-bold">{getFormation(fd.formation as FormationId).label}</dd>
          </div>
        )}
        {fd.role && (
          <div>
            <dt className="text-ash">{t("dna.prefRole")}</dt>
            <dd className="font-display text-[16px] font-bold uppercase">{t(`role.${fd.role}`)}</dd>
          </div>
        )}
        {fd.bucket && (
          <div>
            <dt className="text-ash">{t("dna.favEra")}</dt>
            <dd className="font-display text-[16px] font-bold uppercase">{t(`bucket.${fd.bucket}`)}</dd>
          </div>
        )}
        {fd.behaviour && (
          <div>
            <dt className="text-ash">{t("dna.behaviour")}</dt>
            <dd className="font-display text-[16px] font-bold uppercase leading-tight">{t(fd.behaviour)}</dd>
          </div>
        )}
      </dl>
      <ul className="mt-3 flex flex-col gap-2">
        {axes.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[1fr_96px_1fr] items-center gap-2 text-[11.5px]">
            <span className={`truncate text-right ${v < -0.15 ? "text-chalk" : "text-ash"}`}>{t(`dna.axis.${k}.a`)}</span>
            <span className="relative h-1.5 rounded-full bg-chalk/[0.08]" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-chalk/25" />
              <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-volt" style={{ left: `${50 + v * 50}%` }} />
            </span>
            <span className={`truncate ${v > 0.15 ? "text-chalk" : "text-ash"}`}>{t(`dna.axis.${k}.b`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
