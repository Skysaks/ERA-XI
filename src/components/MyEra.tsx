"use client";

import { useMemo } from "react";
import { getClub, getClubEra, hasClubEra } from "@/data";
import { ACHIEVEMENTS } from "@/game/achievements";
import { bestXIs } from "@/game/collection";
import { DNA_MIN_GAMES, draftDNA } from "@/game/dna";
import { rivals, type FeedEvent, type StoredProfile } from "@/game/storage";
import { useI18n } from "@/i18n/react";
import { nationName } from "@/knowledge/nations";
import { FormDots, type MyEraTarget } from "./Home";
import { EraMark, PitchRule } from "./ui";

/**
 * MY ERA — the personal hub: career, activity, rivals, best XIs, collection. Modules appear
 * only when they have real data behind them; a new player sees two lines, not twelve empty
 * boxes. Everything is local to this device (no account, no feed from other people).
 */
export function MyEraView({
  profile,
  average,
  today,
  onOpen,
  onRematch,
  onDaily,
}: {
  profile: StoredProfile;
  average: number | null;
  today: string | null;
  onOpen: (s: MyEraTarget) => void;
  onRematch: (name: string) => void;
  onDaily: () => void;
}) {
  const { t, lang } = useI18n();
  const p = profile;
  const rivalList = useMemo(() => rivals(p), [p]);
  const bests = useMemo(() => bestXIs(p.gallery, p.recent), [p.gallery, p.recent]);
  const duels = p.career.duel.wins + p.career.duel.losses;
  const discovered = useMemo(() => new Set(p.passport.seenPlayerEras.map((id) => id.slice(id.indexOf(":") + 1))).size, [p.passport.seenPlayerEras]);
  const football = useMemo(() => (p.dna.length >= DNA_MIN_GAMES ? (draftDNA(p.dna)?.football ?? null) : null), [p.dna]);
  const unlocked = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
  const me = p.name.trim() || t("myera.you");
  const dailyOpen = today !== null && !p.daily[today];
  const rel = useMemo(() => {
    const f = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
    return (at: number) => {
      const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
      return f.format(days, "day");
    };
  }, [lang]);
  const eraName = (id: string) => (hasClubEra(id) ? `${getClub(getClubEra(id).clubId).name} ${getClubEra(id).label}` : id);
  const feedLine = (e: FeedEvent): string => {
    switch (e.k) {
      case "pb":
        return t("feed.pb", { n: e.n });
      case "vs":
        return e.won === null
          ? t("feed.vsDraw", { name: e.opp, a: e.yours, b: e.theirs })
          : e.won
            ? t(e.duel ? "feed.duelWin" : "feed.vsWin", { name: e.opp, a: e.yours, b: e.theirs })
            : t(e.duel ? "feed.duelLoss" : "feed.vsLoss", { name: e.opp, a: e.theirs, b: e.yours });
      case "era":
        return t("feed.era", { era: eraName(e.id) });
      case "nation":
        return t("feed.nation", { nation: nationName(e.id, lang, t) });
      case "ach":
        return t("feed.ach", { name: t(`ach.${e.id}.name`) });
    }
  };
  const label = "text-[11px] font-semibold uppercase tracking-[0.14em] text-ash";

  return (
    <div className="flex flex-col gap-5">
      {/* CAREER — the scoreboard */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className={label}>{t("myera.career")}</h3>
          <FormDots days={p.activity} />
        </div>
        <div className={`mt-2 grid ${duels > 0 ? "grid-cols-5" : "grid-cols-4"} gap-1 rounded-[14px] border border-line bg-ink px-2 py-3 text-center`}>
          {(
            [
              ["myera.games", p.games],
              ["myera.best", p.records.bestPoints ?? "—"],
              ["myera.avg", average ?? "—"],
              ...(duels > 0 ? ([["myera.duels", `${p.career.duel.wins}–${p.career.duel.losses}`]] as const) : []),
              ["myera.players", discovered],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="font-display text-[23px] font-bold leading-none tnum">{v}</div>
              <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-ash max-[380px]:tracking-[0.02em]">{t(k)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ACTIVITY — only what this device witnessed */}
      {(p.feed.length > 0 || dailyOpen) && (
        <section>
          <h3 className={label}>{t("myera.activity")}</h3>
          <ul className="mt-1">
            {dailyOpen && (
              <li>
                <button type="button" onClick={onDaily} className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-line text-left">
                  <span className="text-[13.5px] text-chalk">
                    <span className="mr-1.5 text-chalk" aria-hidden>
                      ●
                    </span>
                    {t("feed.daily")}
                  </span>
                  <span className="text-ash" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            )}
            {p.feed.slice(0, 5).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex min-h-10 items-center justify-between gap-3 border-b border-line py-1.5">
                <span className="min-w-0 text-[13.5px] leading-snug text-ash-2">{feedLine(e)}</span>
                <span className="shrink-0 text-[11px] text-ash">{rel(e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* RIVALS — the same friend, several times */}
      {rivalList.length > 0 && (
        <section>
          <h3 className={label}>{t("myera.rivals")}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {rivalList.slice(0, 4).map((r) => (
              <li key={r.name} className="rounded-[12px] border border-line bg-ink px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-display text-[20px] font-extrabold uppercase leading-none tracking-[0.03em] tnum">
                    {me} <span className={r.you >= r.them ? "text-volt" : "text-chalk"}>{r.you}</span>
                    <span className="text-ash"> — </span>
                    <span className={r.them > r.you ? "text-loss" : "text-chalk"}>{r.them}</span> {r.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRematch(r.name)}
                    className="h-10 shrink-0 rounded-full bg-volt px-4 font-display text-[15px] font-bold uppercase tracking-[0.05em] text-ink"
                  >
                    {t("myera.rematch")}
                  </button>
                </div>
                <p className="mt-1.5 text-[12px] text-ash-2 tnum">
                  {t("myera.rivalLine", { avg: r.yourAvg, theirAvg: r.theirAvg, best: r.yourBest, theirBest: r.theirBest, n: r.games })}
                  {r.draws > 0 && <> · {t("myera.draws", { n: r.draws })}</>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* BEST XI — only categories with enough history */}
      {bests.length > 0 && (
        <section>
          <h3 className={label}>{t("myera.bestXI")}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bests.map((b) => (
              <button key={b.category} type="button" onClick={() => onOpen("gallery")} className="flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-ink px-3 hover:border-chalk/30">
                <span className="text-[12px] text-ash-2">{t(`gallery.cat.${b.category}`)}</span>
                <b className="font-display text-[18px] tnum">{b.xi.points}</b>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* COLLECTION — after a pitch-line rule (it replaces the section gap, no extra height) */}
      <PitchRule className="-my-1" />
      <section className="grid grid-cols-2 gap-2">
        {p.gallery.length > 0 && <Tile title={t("gallery.title")} value={t("myera.saved", { n: p.gallery.length })} onClick={() => onOpen("gallery")} />}
        <Tile title={t("passport.short")} value={t("myera.eras", { n: p.passport.eras.length })} onClick={() => onOpen("passport")} />
        <Tile title={t("home.records")} value={t("myera.recordsSub")} onClick={() => onOpen("records")} />
        {football && <Tile title={t("dna.title")} value={t(`dna.arch.${football.archetype}`)} onClick={() => onOpen("passport")} />}
        {unlocked > 0 && <Tile title={t("passport.achievements")} value={`${unlocked} / ${ACHIEVEMENTS.length}`} onClick={() => onOpen("passport")} />}
        {!football && unlocked === 0 && p.dna.length >= DNA_MIN_GAMES && <Tile title={t("dna.title")} value={t("myera.dnaReady")} onClick={() => onOpen("passport")} />}
      </section>
      <p className="flex items-center gap-1.5 text-[11.5px] text-ash">
        <EraMark size={12} className="text-ash/80" />
        {t("records.local")}
      </p>
    </div>
  );
}

function Tile({ title, value, onClick }: { title: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[64px] flex-col justify-center rounded-[12px] border border-chalk/12 px-3 text-left hover:border-chalk/30">
      <span className="font-display text-[17px] font-bold uppercase leading-none tracking-[0.04em]">
        {title} <span aria-hidden>→</span>
      </span>
      <span className="mt-1 text-[11.5px] text-ash-2">{value}</span>
    </button>
  );
}
