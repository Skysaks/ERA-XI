"use client";

import { useMemo, useState } from "react";
import type { PlayerEra } from "@/types";
import { getFormation } from "@/engine";
import { getPlayerEra, hasPlayerEra } from "@/data";
import { bestXIs, type BestCategory, type SavedXI } from "@/game/collection";
import type { StoredProfile } from "@/game/storage";
import { useI18n } from "@/i18n/react";
import { Pitch } from "./Pitch";
import { Button, EmptyState } from "./ui";

/**
 * MY XIs — saved teams: automatic bests (only where enough history exists), recent runs,
 * favourites. Reopen = see the XI; share = the challenge link of that exact run.
 */
export function GalleryView({
  profile,
  onToggleFavourite,
  onPlayDraw,
  linkFor,
}: {
  profile: StoredProfile;
  onToggleFavourite: (id: string) => void;
  /** Replay the same draws against this XI's score (opens the challenge intro). */
  onPlayDraw: (token: string) => void;
  linkFor: (token: string) => string;
}) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<"best" | "recent" | "favourites">("best");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const gallery = profile.gallery;
  const bests = useMemo(() => bestXIs(gallery, profile.recent), [gallery, profile.recent]);
  const recent = [...gallery].sort((a, b) => b.at - a.at).slice(0, 12);
  const favs = gallery.filter((x) => x.favourite).sort((a, b) => b.at - a.at);
  const current = open ? gallery.find((x) => x.id === open) : null;

  if (current) {
    const formation = getFormation(current.formation);
    const players = current.lineup.map((id) => (id && hasPlayerEra(id) ? getPlayerEra(id) : null)) as (PlayerEra | null)[];
    const share = async () => {
      if (!current.token) return;
      const url = linkFor(current.token);
      try {
        if (navigator.share) await navigator.share({ url, title: "ERA XI" });
        else {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }
      } catch {
        /* dismissed */
      }
    };
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => (setOpen(null), setCopied(false))} className="-ml-1 min-h-11 self-start px-1 text-[13px] text-ash-2 hover:text-chalk">
          ← {t("gallery.title")}
        </button>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display text-[44px] font-extrabold leading-none tnum">
            {current.points}
            <span className="text-[20px] text-ash"> / {current.maxPoints}</span>
          </p>
          <button type="button" onClick={() => onToggleFavourite(current.id)} aria-pressed={current.favourite} className="grid size-11 place-items-center rounded-full text-[22px]" aria-label={t(current.favourite ? "gallery.unfavourite" : "gallery.favourite")}>
            <span className={current.favourite ? "text-volt" : "text-ash"}>{current.favourite ? "★" : "☆"}</span>
          </button>
        </div>
        <p className="-mt-2 text-[12.5px] text-ash-2">
          {t(`mode.${current.mode}.name`)} · {formation.label} · {new Date(current.at).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })} · FIT {current.ratings.fit}
        </p>
        <Pitch formation={formation} players={players} variant="draft" showRatings className="h-[300px] w-full" />
        {current.token && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void share()} className="h-12 text-[17px]">
              {copied ? t("gallery.copied") : t("gallery.share")}
            </Button>
            <Button variant="secondary" onClick={() => onPlayDraw(current.token!)} className="h-12 text-[17px]">
              {t("gallery.playDraw")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const item = (x: SavedXI, label?: string) => {
    const names = x.lineup
      .filter((id) => id && hasPlayerEra(id))
      .map((id) => getPlayerEra(id))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 3)
      .map((p) => p.shortName);
    return (
      <li key={`${label ?? ""}${x.id}`}>
        <button type="button" onClick={() => setOpen(x.id)} className="grid min-h-[56px] w-full grid-cols-[52px_1fr_auto] items-center gap-3 rounded-[12px] border border-line bg-ink px-3 py-2 text-left hover:border-chalk/30">
          <span className={`font-display text-[26px] font-bold leading-none tnum ${x.points >= 100 ? "text-volt" : ""}`}>{x.points}</span>
          <span className="min-w-0">
            {label && <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-volt">{label}</span>}
            <span className="block truncate text-[13px] text-chalk">{names.join(" · ")}</span>
            <span className="block truncate text-[11.5px] text-ash">
              {t(`mode.${x.mode}.name`)} · {getFormation(x.formation).label}
            </span>
          </span>
          <span className={x.favourite ? "text-volt" : "text-ash"} aria-hidden>
            {x.favourite ? "★" : "›"}
          </span>
        </button>
      </li>
    );
  };

  const tabs: ["best" | "recent" | "favourites", string, number][] = [
    ["best", t("gallery.best"), bests.length],
    ["recent", t("gallery.recent"), recent.length],
    ["favourites", t("gallery.favourites"), favs.length],
  ];
  const catLabel = (c: BestCategory) => t(`gallery.cat.${c}`);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1 rounded-full bg-chalk/[0.05] p-1" role="tablist">
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`h-10 rounded-full text-[12.5px] font-semibold ${tab === id ? "bg-chalk text-ink" : "text-ash-2"}`}>
            {label} <span className="tnum opacity-60">{n}</span>
          </button>
        ))}
      </div>
      {tab === "best" &&
        (bests.length ? <ul className="flex flex-col gap-1.5">{bests.map((b) => item(b.xi, catLabel(b.category)))}</ul> : <EmptyState>{t("gallery.bestEmpty")}</EmptyState>)}
      {tab === "recent" && (recent.length ? <ul className="flex flex-col gap-1.5">{recent.map((x) => item(x))}</ul> : <EmptyState>{t("gallery.empty")}</EmptyState>)}
      {tab === "favourites" && (favs.length ? <ul className="flex flex-col gap-1.5">{favs.map((x) => item(x))}</ul> : <EmptyState>{t("gallery.favEmpty")}</EmptyState>)}
    </div>
  );
}
