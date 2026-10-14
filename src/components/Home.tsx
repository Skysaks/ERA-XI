"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { EraBucket, FormationId, ModeId } from "@/types";
import { ALL_FORMATION_IDS, ERA_BUCKETS, FORMATIONS, FORMATION_IDS, MODE_GROUPS, MODE_IDS, PRIMARY_MODES, RECORD_MODE_IDS, WEEKLY_META, currentEvent, dailyEventFor, isModeId, oneClubIds, oneLeagueIds } from "@/engine";
import { getClub } from "@/data";
import type { StoredProfile } from "@/game/storage";
import type { ResumeRecord } from "@/game/resume";
import type { Settings } from "@/game/settings";
import { formDots } from "@/game/form";
import { installPlatform, onInstallAvailable, promptInstall, shouldSuggestInstall } from "@/platform/install";
import type { RoomRulesetId } from "@/multiplayer";
import { track } from "@/utils/analytics";
import { useI18n } from "@/i18n/react";
import { Button, EraMark, LangSwitch, Sheet, SheetLoading, SponsorLine, Wordmark } from "./ui";
import { FormationNote } from "./KnowledgeViews";
import { LazyGalleryView, LazyMyEraView, LazyPassportView, LazyRoleSchoolView, LazySettingsSheet } from "./lazy";
import { HelpLink, useOpenHelp } from "./help";
import { homeCta } from "@/game/homeCta";

export interface HomeProps {
  mode: ModeId;
  formation: FormationId;
  eraBucket: EraBucket | null;
  oneClub: string | null;
  oneLeague: string | null;
  onMode: (m: ModeId) => void;
  onFormation: (f: FormationId) => void;
  onEraBucket: (b: EraBucket | null) => void;
  onOneClub: (c: string | null) => void;
  onOneLeague: (c: string | null) => void;
  onPlay: () => void;
  onDaily: () => void;
  onWeekly: () => void;
  /** An autosaved unfinished solo draft. */
  resume: ResumeRecord | null;
  onResume: () => void;
  onDiscardResume: () => void;
  dailyLabel: string;
  dailyPlayed: number | null;
  /** i18n key of a notice to show (e.g. a rejected challenge link). */
  notice: string | null;
  profile: StoredProfile;
  average: number | null;
  onNameChange: (n: string) => void;
  onCreateRoom: (rulesetId: RoomRulesetId) => void;
  onJoinRoom: (code: string) => void;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  updateProfile: (fn: (p: StoredProfile) => StoredProfile) => void;
  /** The web build can be installed (service worker + manifest). */
  installable: boolean;
  /** XI Gallery actions. */
  onToggleFavourite: (id: string) => void;
  onPlayDraw: (token: string) => void;
  linkFor: (token: string) => string;
  /** Today's Daily key (YYYY-MM-DD, UTC), null before boot. */
  today: string | null;
  /** New draft against a named rival (the result offers the rematch link). */
  onRematch: (name: string) => void;
}

function Chip({ active, onClick, children, label, fill = false, small = false, shrink = false }: { active: boolean; onClick: () => void; children: string; label?: string; fill?: boolean; small?: boolean; shrink?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`h-11 ${small ? "text-[15px]" : "text-[17px]"} ${shrink ? "min-w-0 truncate" : "shrink-0"} rounded-full ${fill ? "px-0" : "px-3.5"} font-display font-bold tracking-[0.03em] transition-colors duration-100 ${
        active ? "bg-chalk text-ink" : "border border-chalk/15 text-ash-2 hover:text-chalk"
      }`}
    >
      {children}
    </button>
  );
}

/** Decorative formation diagram — football geometry instead of stock imagery. */
function FormationGlyph({ formation }: { formation: FormationId }) {
  const f = FORMATIONS[formation];
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <rect x="2" y="2" width="96" height="136" rx="3" fill="none" stroke="rgb(241 239 231 / 0.10)" />
      <line x1="2" y1="70" x2="98" y2="70" stroke="rgb(241 239 231 / 0.10)" />
      <circle cx="50" cy="70" r="14" fill="none" stroke="rgb(241 239 231 / 0.10)" />
      <rect x="22" y="112" width="56" height="26" fill="none" stroke="rgb(241 239 231 / 0.10)" />
      <rect x="22" y="2" width="56" height="26" fill="none" stroke="rgb(241 239 231 / 0.10)" />
      {f.slots.map((s) => (
        <circle
          key={s.id}
          cx={6 + s.x * 0.88}
          cy={136 - (s.y * 1.2 + 6)}
          r="4.2"
          className="transition-all duration-300 ease-out"
          fill={s.position === "GK" ? "rgb(241 239 231 / 0.4)" : "rgb(241 239 231 / 0.88)"}
          opacity={s.position === "GK" ? 1 : 0.85}
        />
      ))}
    </svg>
  );
}

/** "Era Lock · 1990s" / "One Club · Barcelona" / "One League · England" — the label of the current choice. */
function choiceLabel(t: (k: string) => string, mode: ModeId, eraBucket: EraBucket | null, oneClub: string | null, oneLeague: string | null): string | null {
  if (mode === "eralock") return eraBucket ? t(`bucket.${eraBucket}`) : t("common.random");
  if (mode === "oneclub") return oneClub ? getClub(oneClub).name : t("common.random");
  if (mode === "oneleague") return oneLeague ? t(`league.${oneLeague}`) : t("common.random");
  return null;
}

export type MyEraTarget = "records" | "passport" | "gallery";
type SheetId = null | "modes" | "records" | "settings" | "passport" | "install" | "formations" | RoomRulesetId | "gallery" | "school" | "myera";

/** ● ● ● ○ ● ● ○  5/7 — active days this week. Dots + a number, never colour alone. */
export function FormDots({ days, className = "", compact = false }: { days: string[]; className?: string; compact?: boolean }) {
  const { t } = useI18n();
  const dots = formDots(days);
  const n = dots.filter(Boolean).length;
  if (compact)
    return (
      <span className={`flex gap-[3px] ${className}`} role="img" aria-label={t("form.aria", { n })} title={t("form.title")}>
        {dots.map((on, i) => (
          <span key={i} className={`size-[6px] rounded-full ${on ? "bg-chalk" : "border border-chalk/25"}`} />
        ))}
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label={t("form.aria", { n })} title={t("form.title")}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("form.label")}</span>
      <span className="flex gap-[3px]" aria-hidden>
        {dots.map((on, i) => (
          <span key={i} className={`size-[7px] rounded-full ${on ? "bg-chalk" : "border border-chalk/25"}`} />
        ))}
      </span>
      <b className="font-display text-[15px] leading-none text-chalk tnum">{n}/7</b>
    </span>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
      <path
        d="M10 12.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Zm6.4-2.8c0-.4 0-.8-.1-1.2l1.6-1.3-1.6-2.8-2 .7a6 6 0 0 0-2-1.2L12 2H8.8l-.4 2.2a6 6 0 0 0-2 1.2l-2-.7-1.6 2.8 1.6 1.3a6 6 0 0 0 0 2.4l-1.6 1.3 1.6 2.8 2-.7a6 6 0 0 0 2 1.2L8.8 18H12l.4-2.2a6 6 0 0 0 2-1.2l2 .7 1.6-2.8-1.6-1.3c.1-.4.1-.8.1-1.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Halfway line and centre circle, barely there: the pitch under the words. */
function PitchWatermark() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[min(520px,70dvh)] overflow-hidden" aria-hidden>
      <svg viewBox="0 0 400 400" className="absolute -right-24 -top-16 h-[420px] w-[420px] opacity-[0.07] sm:-right-10 lg:right-[8%]">
        <circle cx="200" cy="200" r="118" fill="none" stroke="#f1efe7" strokeWidth="2" />
        <circle cx="200" cy="200" r="4" fill="#f1efe7" />
        {/* The mark's geometry: the halfway line stops short of the circle. */}
        <line x1="0" y1="200" x2="66" y2="200" stroke="#f1efe7" strokeWidth="2" />
        <line x1="334" y1="200" x2="400" y2="200" stroke="#f1efe7" strokeWidth="2" />
      </svg>
    </div>
  );
}

function HelpIcon() {
  return (
    <span className="grid size-[19px] place-items-center rounded-full border-[1.5px] border-current font-sans text-[11.5px] font-bold leading-none" aria-hidden>
      ?
    </span>
  );
}

export function Home(props: HomeProps) {
  const { mode, formation, onMode, onFormation, onPlay, onDaily, dailyLabel, dailyPlayed, notice, eraBucket, oneClub, oneLeague, profile, resume } = props;
  const { t } = useI18n();
  const openHelp = useOpenHelp();
  const [sheet, setSheet] = useState<SheetId>(null);
  const [schoolInitial, setSchoolInitial] = useState<string | null>(null);
  const games = profile.games;
  const best = profile.records.bestPoints;
  const extraMode = PRIMARY_MODES.includes(mode) ? null : mode;
  const choice = choiceLabel(t, mode, eraBucket, oneClub, oneLeague);
  const recent = profile.prefs.recentFormations?.length ? profile.prefs.recentFormations : FORMATION_IDS.slice(0, 4);
  const quickFormations = recent.includes(formation) ? recent.slice(0, 4) : [formation, ...recent].slice(0, 4);
  // One primary action, chosen from the player's situation (see game/homeCta.ts).
  const cta = useMemo(() => homeCta(profile, resume, props.today, Date.now()), [profile, resume, props.today]);
  const dailyTheme = props.today ? dailyEventFor(props.today) : null;
  const playLabel = `${t(`mode.${mode}.name`)} · ${FORMATIONS[formation].label}`;

  // Install suggestion: only after real engagement, once per session view, never after a dismissal.
  const [installReady, setInstallReady] = useState(false);
  useEffect(() => {
    const check = () => setInstallReady(props.installable && shouldSuggestInstall(profile.install, games));
    check();
    return onInstallAvailable(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.installable, games, profile.install.dismissed, profile.install.installed]);
  useEffect(() => {
    if (!installReady) return;
    track({ name: "install_prompt_seen", platform: installPlatform() });
    props.updateProfile((p) => ({ ...p, install: { ...p.install, seen: p.install.seen + 1 } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installReady]);
  const dismissInstall = () => {
    track({ name: "install_dismissed" });
    props.updateProfile((p) => ({ ...p, install: { ...p.install, dismissed: true } }));
    setInstallReady(false);
  };
  const doInstall = async () => {
    if (installPlatform() === "ios") return setSheet("install");
    const ok = await promptInstall();
    if (ok) {
      track({ name: "pwa_installed" });
      props.updateProfile((p) => ({ ...p, install: { ...p.install, installed: true } }));
    }
    setInstallReady(false);
  };

  const primary = (() => {
    switch (cta.kind) {
      case "resume":
        return { label: t("home.cta.resume", { n: cta.picks }), sub: cta.daily ? t("mode.daily.name") : null, action: props.onResume };
      case "rematch":
        return { label: t("home.cta.rematch"), sub: t("home.cta.rematchSub", { name: cta.rival, a: cta.theirs, b: cta.yours }), action: () => props.onRematch(cta.rival) };
      case "daily":
        return { label: t("home.cta.daily"), sub: dailyTheme ? t("home.cta.dailySub", { theme: t(`weekly.${dailyTheme}.name`) }) : t("home.dailySame"), action: onDaily };
      case "beat":
        return { label: t("home.cta.beat", { n: cta.best }), sub: t("home.cta.beatSub", { gap: cta.gap }), action: onPlay };
      default:
        return { label: t("home.play"), sub: null, action: onPlay };
    }
  })();

  return (
    <>
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 short:pt-3 flat:flex-row flat:gap-8 flat:px-[max(16px,env(safe-area-inset-left))] lg:flex-row lg:items-center lg:gap-16 lg:px-10">
        <PitchWatermark />
        <section className="relative flex flex-1 flex-col flat:min-w-0">
          <header className="flex items-center justify-between gap-1">
            {games > 0 ? (
              <button type="button" data-action="myera" onClick={() => setSheet("myera")} className="flex min-h-11 min-w-0 items-center gap-2 rounded-full pr-1 text-left" aria-label={t("myera.title")}>
                <span className="font-display text-[17px] font-bold uppercase leading-none tracking-[0.05em] text-chalk">{t("myera.title")}</span>
                <FormDots days={profile.activity} compact />
                {best !== null && <b className="font-display text-[16px] leading-none text-ash-2 tnum">{best}</b>}
                <span className="text-ash" aria-hidden>
                  ›
                </span>
              </button>
            ) : (
              <span className="hidden min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-ash min-[480px]:block">{t("brand.tagline")}</span>
            )}
            <div className="ml-auto flex shrink-0 items-center">
              {games === 0 && <LangSwitch className="mr-1" />}
              <button type="button" data-action="help" onClick={() => openHelp(null)} aria-label={t("help.title")} title={t("help.title")} className="grid size-11 place-items-center rounded-full text-ash hover:bg-chalk/[0.06] hover:text-chalk">
                <HelpIcon />
              </button>
              <button
                type="button"
                onClick={() => setSheet("settings")}
                aria-label={t("settings.title")}
                title={t("settings.title")}
                className="grid size-11 place-items-center rounded-full text-ash hover:bg-chalk/[0.06] hover:text-chalk"
              >
                <GearIcon />
              </button>
            </div>
          </header>

          <div className="mt-[5vh] short:mt-2 lg:mt-0">
            <Wordmark hero className="text-[96px] short:text-[64px] sm:text-[124px] sm:short:text-[80px] lg:text-[160px]" />
            <p className="mt-2 font-display text-[30px] font-semibold uppercase leading-[1.02] tracking-[0.01em] text-chalk short:mt-1 short:text-[24px] lg:text-[40px]">{t("home.title")}</p>
            {games < 3 && <p className="mt-3 max-w-[380px] text-[15px] leading-snug text-ash-2 short:hidden">{t("home.intro")}</p>}
            {/* The match card: the whole game in three numbers. */}
            <p className="mt-3 flex flex-wrap items-center gap-x-2 font-display text-[15px] font-bold uppercase tracking-[0.07em] text-chalk short:mt-1.5 short:text-[14px]" aria-label={t("home.summaryAria")}>
              <span>{t("home.sum.picks")}</span>
              <span className="text-ash" aria-hidden>
                ·
              </span>
              <span>{t("home.sum.matches")}</span>
              <span className="text-ash" aria-hidden>
                ·
              </span>
              <span>{t("home.sum.max")}</span>
            </p>
            {games < 5 && (
              <button type="button" data-action="howto" onClick={() => openHelp("howto")} className="-ml-1 mt-1 flex min-h-11 items-center px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-ash-2 hover:text-chalk short:mt-0">
                {t("home.howto")} <span className="ml-1" aria-hidden>→</span>
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center py-4 short:hidden lg:hidden" aria-hidden>
            <div className={`aspect-[100/140] ${games < 3 ? "h-[min(140px,16dvh)]" : "h-[min(170px,20dvh)]"}`}>
              <FormationGlyph formation={formation} />
            </div>
          </div>

          {notice && (
            <p className="mt-5 rounded-[10px] border border-loss/30 bg-loss/10 px-3 py-2 text-[13px] text-loss" role="status">
              {t(notice)}
            </p>
          )}
        </section>

        <section className="relative flex flex-col gap-3 pt-2 short:pt-3 flat:w-[min(400px,50%)] flat:shrink-0 flat:pt-2 lg:w-[400px] lg:pt-0">
          <div className="hidden h-[260px] w-[186px] self-center lg:block">
            <FormationGlyph formation={formation} />
          </div>

          <div className="flex items-center gap-2" role="group" aria-label={t("home.mode")}>
            {PRIMARY_MODES.map((m) => (
              <Chip key={m} active={mode === m} onClick={() => onMode(m)}>
                {t(`mode.${m}.name`)}
              </Chip>
            ))}
            {extraMode && (
              <Chip active shrink onClick={() => setSheet("modes")}>
                {t(`mode.${extraMode}.name`)}
              </Chip>
            )}
          </div>
          {choice && (
            <button type="button" onClick={() => setSheet("modes")} className="-mt-1 self-start px-1 text-[12.5px] text-ash-2 hover:text-chalk">
              {mode === "eralock" ? t("home.period") : mode === "oneleague" ? t("home.league") : t("home.club")}: <b className="text-chalk">{choice}</b> ›
            </button>
          )}
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={t("home.formation")}>
            {quickFormations.map((f) => (
              <Chip key={f} fill small={FORMATIONS[f].label.length > 5} active={formation === f} onClick={() => onFormation(f)}>
                {FORMATIONS[f].label}
              </Chip>
            ))}
            <Chip fill active={false} label={t("formation.more")} onClick={() => setSheet("formations")}>
              {"+ " + (ALL_FORMATION_IDS.length - quickFormations.length)}
            </Chip>
          </div>

          {/* One primary action. Resume, a rival, today's Daily or a near miss replace PLAY — never alongside it. */}
          <Button onClick={primary.action} data-cta={cta.kind} className={`mt-1 w-full flex-col gap-0 leading-none ${primary.sub ? "h-[74px] text-[28px] short:h-[62px] short:text-[24px]" : "h-[68px] text-[30px] short:h-[58px]"}`}>
            <span className="max-w-full truncate">{primary.label}</span>
            {primary.sub && <span className="mt-1 max-w-full truncate font-sans text-[12.5px] font-semibold normal-case tracking-normal text-ink/70">{primary.sub}</span>}
          </Button>
          {cta.kind === "play" || cta.kind === "beat" ? (
            <button type="button" onClick={onDaily} className="flex h-12 items-center justify-between rounded-[12px] border border-chalk/12 px-4 text-left hover:border-chalk/30">
              <span className="shrink-0 whitespace-nowrap font-display text-[19px] font-bold uppercase tracking-[0.04em]">
                {t("home.daily")} <span className="font-sans text-[12px] font-medium normal-case tracking-normal text-ash">· {dailyLabel}</span>
              </span>
              <span className="ml-3 min-w-0 truncate text-right text-[12px] text-ash-2">
                {dailyPlayed !== null ? (
                  <>
                    {t("home.dailyPlayed")} · <b className="font-display text-[16px] text-chalk">{dailyPlayed}</b>
                  </>
                ) : (
                  t("home.dailySame")
                )}
              </span>
            </button>
          ) : (
            <div className="-mt-1 flex items-center justify-between gap-2">
              <button type="button" data-action="secondary-play" onClick={onPlay} className="flex min-h-11 min-w-0 items-center px-1 text-left text-[13px] text-ash-2 hover:text-chalk">
                <span className="truncate">
                  {t("home.orPlay")} <b className="text-chalk">{playLabel}</b> →
                </span>
              </button>
              {cta.kind === "resume" && (
                <button type="button" onClick={props.onDiscardResume} className="min-h-11 shrink-0 px-1 text-[12.5px] text-ash hover:text-chalk">
                  {t("resume.discardShort")}
                </button>
              )}
            </div>
          )}
          <SponsorLine slot="daily" className="-mt-2 px-4" />
          <div className="grid grid-cols-[0.7fr_1.3fr] gap-2 min-[360px]:grid-cols-[0.8fr_1.2fr]">
            <button type="button" onClick={() => setSheet("liveduel")} className="flex h-[52px] items-center gap-2 rounded-[12px] border border-chalk/12 px-4 text-left hover:border-chalk/30">
              <span className="relative flex shrink-0" aria-hidden>
                <EraMark size={16} className="text-chalk/75" />
              </span>
              <span className="font-display text-[18px] font-bold uppercase tracking-[0.04em]">{t("home.duel")}</span>
            </button>
            <button type="button" data-action="modes" onClick={() => setSheet("modes")} className="flex h-[52px] min-w-0 flex-col items-start justify-center rounded-[12px] border border-chalk/12 px-4 text-left hover:border-chalk/30">
              <span className="font-display text-[18px] font-bold uppercase leading-none tracking-[0.04em]">
                {t("home.modes")} <span aria-hidden>→</span>
              </span>
              <span className="mt-0.5 max-w-full truncate text-[11px] text-ash">{t("home.modesSub")}</span>
            </button>
          </div>

          {installReady && (
            <div className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-2">
              <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ash-2">{t("install.suggest")}</p>
              <Button variant="secondary" onClick={() => void doInstall()} className="h-9 shrink-0 px-3 text-[15px]">
                {t("install.cta")}
              </Button>
              <button type="button" onClick={dismissInstall} aria-label={t("install.dismiss")} className="grid size-9 shrink-0 place-items-center text-ash hover:text-chalk">
                <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden>
                  <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}
          <SponsorLine slot="home" className="text-center" />
        </section>
      </main>

      <Sheet open={sheet === "modes"} onClose={() => setSheet(null)} title={t("modes.title")}>
        <ModesList
          {...props}
          onClose={() => setSheet(null)}
          onLive={(r) => setSheet(r)}
          onSchool={(id) => {
            setSchoolInitial(id);
            setSheet("school");
          }}
        />
      </Sheet>
      <Sheet
        open={sheet === "liveduel" || sheet === "party" || sheet === "shared"}
        onClose={() => setSheet(null)}
        title={sheet === "liveduel" || sheet === "party" || sheet === "shared" ? t(`mode.${sheet}.name`) : ""}
      >
        {(sheet === "liveduel" || sheet === "party" || sheet === "shared") && <LiveSheet {...props} rulesetId={sheet} onSwitch={(r) => setSheet(r)} />}
      </Sheet>
      <Sheet open={sheet === "myera"} onClose={() => setSheet(null)} title={t("myera.title")}>
        <Suspense fallback={<SheetLoading />}>
          <LazyMyEraView
            profile={profile}
            average={props.average}
            today={props.today}
            onOpen={(s) => setSheet(s)}
            onRematch={(name) => {
              setSheet(null);
              props.onRematch(name);
            }}
            onDaily={() => {
              setSheet(null);
              onDaily();
            }}
          />
        </Suspense>
      </Sheet>
      <Sheet open={sheet === "records"} onClose={() => setSheet(null)} title={t("home.records")}>
        <RecordsView {...props} onPassport={() => setSheet("passport")} onGallery={() => setSheet("gallery")} />
      </Sheet>
      <Sheet open={sheet === "passport"} onClose={() => setSheet(null)} title={t("passport.title")}>
        <Suspense fallback={<SheetLoading />}>
          <LazyPassportView
            profile={profile}
            onSchool={() => {
              setSchoolInitial(null);
              setSheet("school");
            }}
          />
        </Suspense>
      </Sheet>
      <Sheet open={sheet === "gallery"} onClose={() => setSheet(null)} title={t("gallery.title")}>
        <Suspense fallback={<SheetLoading />}>
          <LazyGalleryView
            profile={profile}
            onToggleFavourite={props.onToggleFavourite}
            onPlayDraw={(token) => {
              setSheet(null);
              props.onPlayDraw(token);
            }}
            linkFor={props.linkFor}
          />
        </Suspense>
      </Sheet>
      <Sheet open={sheet === "school"} onClose={() => setSheet(null)} title={t("know.schoolTitle")}>
        <Suspense fallback={<SheetLoading />}>
          <LazyRoleSchoolView initial={schoolInitial} />
        </Suspense>
      </Sheet>
      <Sheet open={sheet === "settings"} onClose={() => setSheet(null)} title={t("settings.title")}>
        <Suspense fallback={<SheetLoading />}>
          <LazySettingsSheet {...props} onInstall={() => void doInstall()} onPassport={() => setSheet("passport")} />
        </Suspense>
      </Sheet>
      <Sheet open={sheet === "formations"} onClose={() => setSheet(null)} title={t("formation.all")}>
        <div className="grid grid-cols-3 gap-2">
          {ALL_FORMATION_IDS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={formation === f}
              onClick={() => {
                onFormation(f);
                setSheet(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-[12px] border px-2 py-2 ${formation === f ? "border-chalk/60 bg-chalk/[0.06]" : "border-line bg-ink hover:border-chalk/30"}`}
            >
              <span className="aspect-[100/140] h-[64px]" aria-hidden>
                <FormationGlyph formation={f} />
              </span>
              <span className="font-display text-[16px] font-bold tracking-[0.03em]">{FORMATIONS[f].label}</span>
            </button>
          ))}
        </div>
        <FormationNote formation={formation} className="mt-3" />
        <p className="mt-3 text-[11.5px] text-ash">{t("formation.homeNote")}</p>
      </Sheet>
      <Sheet open={sheet === "install"} onClose={() => setSheet(null)} title={t("install.iosTitle")}>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-[14px] text-ash-2">
          <li>{t("install.ios1")}</li>
          <li>{t("install.ios2")}</li>
          <li>{t("install.ios3")}</li>
        </ol>
      </Sheet>
    </>
  );
}

function ModesList({ mode, eraBucket, oneClub, oneLeague, onMode, onEraBucket, onOneClub, onOneLeague, onWeekly, onDaily, onClose, onLive, onSchool }: HomeProps & { onClose: () => void; onLive: (r: RoomRulesetId) => void; onSchool: (id: string) => void }) {
  const { t, lang } = useI18n();
  const schoolName = (id: string) => (id === "regista" ? "Regista" : t(`role.${id}`));
  const clubs = oneClubIds();
  const leagues = oneLeagueIds();
  const week = currentEvent();
  const until = new Date(`${week.end}T12:00:00Z`).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-4">
      <HelpLink id="modes" label={t("help.modesLink")} />
      {/* This week: a theme on the core engine. A date, not a countdown. */}
      <section className="rounded-[12px] border border-pitch-line bg-pitch/40 px-3.5 py-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-chalk"><EraMark size={12} className="text-chalk/70" />{t("weekly.thisWeek")}</p>
        <p className="mt-1 font-display text-[24px] font-bold uppercase leading-none tracking-[0.03em]">{t(`weekly.${week.event.id}.name`)}</p>
        <p className="mt-1 text-[12.5px] leading-snug text-ash-2">{t(`weekly.${week.event.id}.desc`)}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-ash">{t("weekly.until", { date: until })}</span>
          <Button
            onClick={() => {
              onClose();
              onWeekly();
            }}
            className="h-11 px-5 text-[18px]"
          >
            {t("modes.play")}
          </Button>
        </div>
        {(WEEKLY_META[week.event.id]?.school || WEEKLY_META[week.event.id]?.recommend) && (
          <div className="mt-2 flex flex-wrap gap-x-4 border-t border-pitch-line pt-1">
            {WEEKLY_META[week.event.id]?.school && (
              <button type="button" onClick={() => onSchool(WEEKLY_META[week.event.id]!.school!)} className="min-h-11 text-left text-[12.5px] text-chalk hover:underline">
                {t("weekly.school")} <b>{schoolName(WEEKLY_META[week.event.id]!.school!)}</b> →
              </button>
            )}
            {WEEKLY_META[week.event.id]?.recommend && isModeId(WEEKLY_META[week.event.id]?.recommend ?? "") && (
              <button
                type="button"
                onClick={() => {
                  onMode(WEEKLY_META[week.event.id]!.recommend as ModeId);
                  onClose();
                }}
                className="min-h-11 text-left text-[12.5px] text-chalk hover:underline"
              >
                {t("weekly.recommend")} <b>{t(`mode.${WEEKLY_META[week.event.id]!.recommend}.name`)}</b> →
              </button>
            )}
          </div>
        )}
      </section>

      {MODE_GROUPS.map((g) => (
        <section key={g.id}>
          <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">
            <EraMark size={11} className="text-ash/80" />
            {t(`modes.group.${g.id}`)}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {g.entries.map((m) => {
              const live = m.status === "live" && m.mode;
              const active = Boolean(live && m.mode === mode);
              const label = m.id === "rival" ? t("modes.rival.name") : t(`mode.${m.id}.name`);
              const desc = m.id === "rival" ? t("modes.rival.desc") : t(`mode.${m.id}.desc`);
              const isDaily = m.id === "daily";
              const badge = active ? t("modes.selected") : m.status === "multiplayer" ? t("modes.live") : isDaily ? t("modes.play") : m.status === "entry" ? t("modes.fromResults") : null;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={m.status === "entry" && !isDaily}
                    onClick={() => {
                      if (m.status === "multiplayer") return onLive(m.id as RoomRulesetId);
                      if (isDaily) {
                        onClose();
                        return onDaily();
                      }
                      if (m.mode) onMode(m.mode);
                      // Modes with a pre-draft choice keep the sheet open to show it.
                      if (m.mode !== "eralock" && m.mode !== "oneclub" && m.mode !== "oneleague") onClose();
                    }}
                    className={`flex w-full items-start gap-3 rounded-[12px] border px-3.5 py-2.5 text-left transition-colors disabled:cursor-default ${
                      active ? "border-chalk/50 bg-chalk/[0.05]" : "border-line bg-ink hover:border-chalk/30 disabled:hover:border-line"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[19px] font-bold uppercase leading-none tracking-[0.03em]">{label}</span>
                      <span className="mt-1 block text-[12.5px] leading-snug text-ash-2">{desc}</span>
                    </span>
                    {badge && (
                      <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
                          active ? "bg-chalk text-ink" : m.status === "multiplayer" ? "bg-pitch text-chalk" : "bg-chalk/[0.08] text-ash-2"
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                  {active && m.mode === "eralock" && (
                    <ChoiceRow title={t("modes.choosePeriod")}>
                      <Chip small active={eraBucket === null} onClick={() => onEraBucket(null)}>
                        {t("common.random")}
                      </Chip>
                      {ERA_BUCKETS.map((b) => (
                        <Chip key={b} small active={eraBucket === b} onClick={() => onEraBucket(b)}>
                          {t(`bucket.${b}`)}
                        </Chip>
                      ))}
                    </ChoiceRow>
                  )}
                  {active && m.mode === "oneclub" && (
                    <ChoiceRow title={t("modes.chooseClub")}>
                      <Chip small active={oneClub === null} onClick={() => onOneClub(null)}>
                        {t("common.random")}
                      </Chip>
                      {clubs.map((c) => (
                        <Chip key={c} small active={oneClub === c} onClick={() => onOneClub(c)}>
                          {getClub(c).name}
                        </Chip>
                      ))}
                    </ChoiceRow>
                  )}
                  {active && m.mode === "oneleague" && (
                    <ChoiceRow title={t("modes.chooseLeague")}>
                      <Chip small active={oneLeague === null} onClick={() => onOneLeague(null)}>
                        {t("common.random")}
                      </Chip>
                      {leagues.map((c) => (
                        <Chip key={c} small active={oneLeague === c} onClick={() => onOneLeague(c)}>
                          {t(`league.${c}`)}
                        </Chip>
                      ))}
                    </ChoiceRow>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ChoiceRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-[12px] border border-line bg-ink px-3 py-2.5">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function LiveSheet({ rulesetId, formation, profile, onNameChange, onCreateRoom, onJoinRoom, onSwitch }: HomeProps & { rulesetId: RoomRulesetId; onSwitch: (r: RoomRulesetId) => void }) {
  const { t } = useI18n();
  const name = profile.name;
  const [code, setCode] = useState("");
  const clean = code.toLowerCase().replace(/[^a-z2-9]/g, "").slice(0, 5);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-snug text-ash-2">{t(`mode.${rulesetId}.desc`)}</p>
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value.slice(0, 16))}
        placeholder={t("live.name")}
        maxLength={16}
        aria-label={t("live.name")}
        className="h-12 rounded-[12px] border border-chalk/15 bg-ink px-4 text-[16px] text-chalk placeholder:text-ash focus:border-chalk/60 focus:outline-none"
      />
      <Button onClick={() => onCreateRoom(rulesetId)} className="h-[60px] w-full text-[22px]">
        {t(`live.create.${rulesetId}`, { formation: FORMATIONS[formation].label })}
      </Button>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean.length === 5) onJoinRoom(clean);
        }}
      >
        <input
          value={clean}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("live.code")}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-label={t("live.code")}
          className="h-12 min-w-0 flex-1 rounded-[12px] border border-chalk/15 bg-ink px-4 font-display text-[22px] font-bold uppercase tracking-[0.2em] text-chalk placeholder:font-sans placeholder:text-[15px] placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-ash focus:border-chalk/60 focus:outline-none"
        />
        <Button type="submit" variant="secondary" disabled={clean.length !== 5} className="h-12 shrink-0 px-5 text-[19px]">
          {t("live.join")}
        </Button>
      </form>
      <div className="flex flex-col items-start">
        {rulesetId !== "party" && (
          <button type="button" onClick={() => onSwitch("party")} className="py-1 text-[12.5px] text-ash hover:text-chalk">
            {t("live.toParty")}
          </button>
        )}
        {rulesetId !== "liveduel" && (
          <button type="button" onClick={() => onSwitch("liveduel")} className="py-1 text-[12.5px] text-ash hover:text-chalk">
            {t("live.toDuel")}
          </button>
        )}
        {rulesetId !== "shared" && (
          <button type="button" onClick={() => onSwitch("shared")} className="py-1 text-[12.5px] text-ash hover:text-chalk">
            {t("live.toShared")}
          </button>
        )}
      </div>
    </div>
  );
}

function RecordsView({ profile, average, onPassport, onGallery }: HomeProps & { onPassport: () => void; onGallery: () => void }) {
  const { t } = useI18n();
  const { records, career, daily, games } = profile;
  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 7);
  const row = (label: string, value: number | string | null) => (
    <div key={label} className="flex items-baseline justify-between border-b border-line py-2">
      <span className="text-[13.5px] text-ash-2">{label}</span>
      <b className="font-display text-[22px] tnum">{value ?? "—"}</b>
    </div>
  );
  const modeRows = RECORD_MODE_IDS.filter((m) => (MODE_IDS.includes(m) && (m === "classic" || m === "iq")) || records.byMode[m] !== undefined);
  const recent = profile.recent.filter((r) => r.mode !== "gauntlet").slice(0, 10);
  return (
    <div className="flex flex-col gap-5">
      <section>
        <FormDots days={profile.activity} className="mb-2" />
        {row(t("records.best"), records.bestPoints)}
        {row(t("records.average"), average)}
        {row(t("records.games"), games)}
        {row(t("records.hundreds"), records.hundreds)}
        {row(t("records.unbeaten"), records.unbeaten)}
        {row(t("records.dailyAttempts"), Object.keys(daily).length)}
      </section>
      {recent.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("records.recent")}</h3>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <span
                key={`${r.seed}-${r.at}`}
                className={`rounded-[6px] px-1.5 py-0.5 font-display text-[16px] font-bold tnum ${r.points >= 100 ? "bg-volt text-ink" : "bg-chalk/[0.07] text-chalk"}`}
                title={t(`mode.${r.mode}.name`)}
              >
                {r.points}
              </span>
            ))}
          </p>
        </section>
      )}
      {(career.duel.wins + career.duel.losses > 0 || career.party.played > 0) && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("records.live")}</h3>
          {career.duel.wins + career.duel.losses > 0 && row(t("records.duels"), t("stat.wl", { w: career.duel.wins, l: career.duel.losses }))}
          {career.party.played > 0 && row(t("records.parties"), `${career.party.wins} / ${career.party.played}`)}
        </section>
      )}
      {dailyRows.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("records.dailyHistory")}</h3>
          {dailyRows.map(([day, e]) => (
            <div key={day} className="flex items-baseline justify-between border-b border-line py-2">
              <span className="text-[13.5px] text-ash-2 tnum">
                {day}
                {e.attempts > 1 && <span className="text-ash"> · {t("records.replays", { n: e.attempts - 1 })}</span>}
              </span>
              <b className="font-display text-[22px] tnum">{e.official.points}</b>
            </div>
          ))}
        </section>
      )}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("records.bestRatings")}</h3>
        <div className="mt-2 grid grid-cols-5 gap-1 rounded-[12px] border border-line bg-ink px-2 py-3 text-center">
          {(
            [
              ["stat.att", records.bestAtt],
              ["stat.mid", records.bestMid],
              ["stat.def", records.bestDef],
              ["stat.gk", records.bestGk],
              ["stat.fit", records.bestFit],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <div className="font-display text-[24px] font-bold leading-none tnum">{v ?? "—"}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ash">{t(k)}</div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{t("records.byMode")}</h3>
        {modeRows.map((m) => {
          const v = records.byMode[m];
          return row(t(`mode.${m}.name`), v === undefined ? null : m === "gauntlet" ? `${v} / 10` : v);
        })}
      </section>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onGallery} className="h-12 w-full text-[17px]">
          {t("gallery.title")} →
        </Button>
        <Button variant="secondary" onClick={onPassport} className="h-12 w-full text-[17px]">
          {t("passport.short")} →
        </Button>
      </div>
      <p className="text-[11.5px] text-ash">{t("records.local")}</p>
    </div>
  );
}
