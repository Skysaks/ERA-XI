"use client";

import { useState, type ReactNode } from "react";
import type { FormationId, ModeId } from "@/types";
import { ALL_FORMATION_IDS, FORMATIONS, MODE_IDS } from "@/engine";
import type { KnowledgeLevel, Settings, SimSpeed, Motion } from "@/game/settings";
import { deleteAllData, exportData } from "@/game/storage";
import { installPlatform } from "@/platform/install";
import { PUSH_AVAILABLE } from "@/platform/notifications";
import { useI18n } from "@/i18n/react";
import { Button, LangSwitch } from "./ui";
import type { HomeProps } from "./Home";

/**
 * Settings with progressive disclosure: GAME is open, EXPERIENCE and ACCOUNT & PRIVACY
 * are one tap away. Nothing here is required to play.
 */
export function SettingsSheet(props: HomeProps & { onInstall: () => void; onPassport: () => void }) {
  const { settings: s, onSettings, mode, formation, onMode, onFormation, profile } = props;
  const { t } = useI18n();
  const set = (patch: Partial<Settings>) => onSettings(patch);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exported, setExported] = useState<"copied" | "shown" | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);
  const platform = typeof window === "undefined" ? "unsupported" : installPlatform();
  const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  const doExport = async () => {
    const json = exportData();
    try {
      await navigator.clipboard.writeText(json);
      setExported("copied");
    } catch {
      setExportText(json);
      setExported("shown");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Group title={t("settings.game")} open>
        <Field label={t("settings.formation")}>
          <select
            value={formation}
            onChange={(e) => onFormation(e.target.value as FormationId)}
            className="h-11 w-full rounded-[10px] border border-chalk/15 bg-ink px-3 text-[15px] text-chalk focus:border-volt focus:outline-none"
          >
            {ALL_FORMATION_IDS.map((f) => (
              <option key={f} value={f}>
                {FORMATIONS[f].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("settings.mode")}>
          <select
            value={mode}
            onChange={(e) => onMode(e.target.value as ModeId)}
            className="h-11 w-full rounded-[10px] border border-chalk/15 bg-ink px-3 text-[15px] text-chalk focus:border-volt focus:outline-none"
          >
            {MODE_IDS.map((m) => (
              <option key={m} value={m}>
                {t(`mode.${m}.name`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("settings.sim")}>
          <div className="grid grid-cols-3 gap-1">
            {(["live", "fast", "instant"] as SimSpeed[]).map((v) => (
              <Seg key={v} active={s.simSpeed === v} onClick={() => set({ simSpeed: v })}>
                {t(`settings.sim.${v}`)}
              </Seg>
            ))}
          </div>
        </Field>
        <Field label={t("settings.knowledge")}>
          <div className="grid grid-cols-3 gap-1">
            {(["minimal", "standard", "deep"] as KnowledgeLevel[]).map((v) => (
              <Seg key={v} active={s.knowledge === v} onClick={() => set({ knowledge: v })}>
                {t(`settings.knowledge.${v}`)}
              </Seg>
            ))}
          </div>
          <p className="mt-1 text-[11.5px] text-ash">{t(`settings.knowledge.${s.knowledge}.hint`)}</p>
        </Field>
        <Toggle label={t("settings.hints")} hint={t("settings.hintsHint")} on={s.hints} onChange={(v) => set({ hints: v })} />
        <Toggle label={t("settings.preview")} hint={t("settings.previewHint")} on={s.preview} onChange={(v) => set({ preview: v })} />
        <Toggle label={t("settings.postPick")} hint={t("settings.postPickHint")} on={s.postPickStats} onChange={(v) => set({ postPickStats: v })} />
        <Toggle label={t("settings.resume")} on={s.resume} onChange={(v) => set({ resume: v })} />
        <p className="pt-1 text-[11.5px] text-ash">{t("settings.integrity")}</p>
      </Group>

      <Group title={t("settings.experience")}>
        <Field label={t("common.language")}>
          <LangSwitch className="self-start" />
        </Field>
        <Toggle label={t("settings.sound")} on={s.sound} onChange={(v) => set({ sound: v })} />
        {canVibrate && <Toggle label={t("settings.haptics")} on={s.haptics} onChange={(v) => set({ haptics: v })} />}
        <Field label={t("settings.motion")}>
          <div className="grid grid-cols-3 gap-1">
            {(["system", "full", "reduced"] as Motion[]).map((v) => (
              <Seg key={v} active={s.motion === v} onClick={() => set({ motion: v })}>
                {t(`settings.motion.${v}`)}
              </Seg>
            ))}
          </div>
        </Field>
        <Toggle label={t("settings.contrast")} on={s.highContrast} onChange={(v) => set({ highContrast: v })} />
        <Toggle label={t("settings.largeText")} on={s.largeText} onChange={(v) => set({ largeText: v })} />
        {props.installable && (
          <Field label={t("settings.install")}>
            {platform === "installed" ? (
              <p className="text-[13px] text-ash-2">{t("settings.installed")}</p>
            ) : platform === "prompt" || platform === "ios" ? (
              <Button variant="secondary" onClick={props.onInstall} className="h-11 self-start px-4 text-[16px]">
                {t("install.cta")}
              </Button>
            ) : (
              <p className="text-[13px] text-ash-2">{t("settings.installBrowser")}</p>
            )}
          </Field>
        )}
      </Group>

      <Group title={t("settings.account")}>
        <Field label={t("settings.status")}>
          <p className="text-[13.5px] text-chalk">
            {t("settings.guest")} <span className="text-ash">· {profile.account.guestId.slice(0, 6)}</span>
          </p>
          <p className="text-[12px] leading-snug text-ash-2">{t("settings.guestNote")}</p>
          <Button variant="secondary" disabled className="mt-1 h-10 self-start px-4 text-[15px]">
            {t("settings.accountSoon")}
          </Button>
        </Field>
        <Toggle label={t("settings.sync")} hint={t("settings.needsAccount")} on={false} disabled onChange={() => {}} />
        <Toggle label={t("settings.publicProfile")} hint={t("settings.needsAccount")} on={s.publicProfile} disabled onChange={(v) => set({ publicProfile: v })} />
        <Toggle label={t("settings.leaderboards")} hint={t("settings.needsAccount")} on={s.leaderboards} disabled onChange={(v) => set({ leaderboards: v })} />
        <Toggle label={t("settings.analytics")} hint={t("settings.analyticsHint")} on={s.analytics} onChange={(v) => set({ analytics: v })} />
        <Field label={t("settings.notifications")}>
          <p className="text-[12px] leading-snug text-ash-2">{PUSH_AVAILABLE ? t("settings.notifHint") : t("settings.notifSoon")}</p>
          {(["daily", "challenge", "duel", "weekly"] as const).map((k) => (
            <Toggle
              key={k}
              label={t(`settings.notif.${k}`)}
              on={s.notifications[k]}
              disabled={!PUSH_AVAILABLE}
              onChange={(v) => set({ notifications: { ...s.notifications, [k]: v } })}
            />
          ))}
        </Field>
        <Field label={t("settings.data")}>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void doExport()} className="h-10 px-4 text-[15px]">
              {exported === "copied" ? t("settings.exported") : t("settings.export")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                deleteAllData();
                window.location.reload();
              }}
              className={`h-10 px-4 text-[15px] ${confirmDelete ? "border-loss text-loss" : ""}`}
            >
              {confirmDelete ? t("settings.deleteConfirm") : t("settings.delete")}
            </Button>
          </div>
          {exportText && (
            <textarea readOnly value={exportText} className="mt-2 h-28 w-full rounded-[10px] border border-line bg-ink p-2 font-mono text-[11px] text-ash-2" aria-label={t("settings.export")} />
          )}
          <p className="text-[11.5px] text-ash">{t("settings.dataNote")}</p>
        </Field>
      </Group>

      <button type="button" onClick={props.onPassport} className="mt-1 h-11 text-left text-[13px] text-ash-2 hover:text-chalk">
        {t("passport.title")} ›
      </button>
    </div>
  );
}

function Group({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-[12px] border border-line bg-ink px-3.5">
      <summary className="flex h-12 cursor-pointer list-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-ash-2 [&::-webkit-details-marker]:hidden">
        {title}
        <span className="font-display text-[18px] transition-transform group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-3.5">{children}</div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ash">{label}</span>
      {children}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-11 min-w-0 truncate rounded-[9px] px-1 font-display text-[15px] font-bold uppercase tracking-[0.03em] ${active ? "bg-chalk text-ink" : "border border-chalk/15 text-ash-2 hover:text-chalk"}`}
    >
      {children}
    </button>
  );
}

function Toggle({ label, hint, on, onChange, disabled = false }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex min-h-[44px] items-center justify-between gap-3 ${disabled ? "opacity-45" : "cursor-pointer"}`}>
      <span className="min-w-0">
        <span className="block text-[14px] text-chalk">{label}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-ash">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-volt ${on ? "bg-volt" : "bg-chalk/15"}`}
      >
        <span className={`absolute top-1 size-5 rounded-full transition-[left] ${on ? "left-6 bg-ink" : "left-1 bg-chalk"}`} />
        <span className="sr-only">{on ? "on" : "off"}</span>
      </span>
    </label>
  );
}
