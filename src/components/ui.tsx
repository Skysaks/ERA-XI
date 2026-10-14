"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import { LANGS, LANG_LABEL, LANG_NAME } from "@/i18n";
import { sponsorFor, type SponsorSlot } from "@/platform/sponsor";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex h-14 items-center justify-center gap-2 rounded-[12px] px-6 font-display text-[22px] font-bold uppercase tracking-[0.04em] transition-[transform,background-color,opacity] duration-100 active:scale-[0.98] disabled:opacity-40";
  const styles: Record<Variant, string> = {
    primary: "bg-volt text-ink hover:bg-[#e4ff75]",
    secondary: "border border-chalk/20 bg-transparent text-chalk hover:border-chalk/40",
    ghost: "h-11 bg-transparent px-3 text-[17px] text-ash-2 hover:text-chalk",
  };
  return (
    <button type="button" className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Stat({ label, value, accent = false, size = "md" }: { label: string; value: ReactNode; accent?: boolean; size?: "sm" | "md" | "lg" }) {
  const num = size === "lg" ? "text-[40px]" : size === "sm" ? "text-[22px]" : "text-[30px]";
  return (
    <div className="flex flex-col items-center">
      <span className={`font-display font-bold leading-none tnum ${num} ${accent ? "text-volt" : "text-chalk"}`}>{value}</span>
      <span className="mt-1 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.06em] text-ash">{label}</span>
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "volt" | "loss" }) {
  const t =
    tone === "volt" ? "bg-volt text-ink" : tone === "loss" ? "bg-loss/15 text-loss" : "bg-chalk/[0.07] text-ash-2";
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${t}`}>
      {children}
    </span>
  );
}

/** Bottom sheet on mobile, centred panel on desktop. Esc / backdrop closes. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("common.close")} className="absolute inset-0 bg-ink/70 animate-fade" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-t-[20px] border border-line bg-ink-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 animate-sheet sm:rounded-[20px] sm:pb-5 sm:animate-rise">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-chalk/20 sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[22px] font-bold uppercase tracking-[0.04em]">{title}</h2>
          <button type="button" onClick={onClose} className="-mr-2 grid size-11 place-items-center rounded-full text-ash-2 hover:text-chalk" aria-label={t("common.close")}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * ERA XI's mark: the centre circle, the kick-off spot and the halfway line stopping short of it.
 * Sporting punctuation, never decoration: separators, loading, signatures, empty states.
 */
export function EraMark({ size = 16, className = "", draw = false }: { size?: number; className?: string; draw?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <path d="M1.5 12h4.2M18.3 12h4.2" />
      <circle cx="12" cy="12" r="5.6" pathLength={100} className={draw ? "era-mark-draw" : undefined} />
      <circle cx="12" cy="12" r="1.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Pitch-line separator: a hairline through the mark. Takes the height of the gap it replaces. */
export function PitchRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-pitch-line ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-current" />
      <EraMark size={12} className="text-ash/80" />
      <span className="h-px flex-1 bg-current" />
    </div>
  );
}

/** Matchday-style stamp for brand moments inside an existing transition: fades in, holds, leaves. Never takes layout. */
export function BrandStamp({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center ${className}`} aria-hidden>
      <span className="flex items-center gap-2 rounded-full border border-chalk/15 bg-ink/85 px-3.5 py-1.5 font-display text-[15px] font-bold uppercase tracking-[0.16em] text-chalk shadow-[0_6px_24px_rgb(0_0_0/0.35)] animate-stamp">
        <EraMark size={13} className="text-chalk/80" />
        {children}
      </span>
    </div>
  );
}

/** Full-screen loading identity (lazy screens, first paint): the mark draws itself. */
export function BrandLoading({ label }: { label?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink" aria-busy="true">
      <div className="flex flex-col items-center gap-3 text-chalk">
        <EraMark size={44} draw />
        <span className="font-display text-[13px] font-bold uppercase tracking-[0.32em] text-ash-2">{label ?? "ERA XI"}</span>
      </div>
    </main>
  );
}

/** Empty state: the mark over one line of text, no illustration. */
export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 py-5 text-center ${className}`}>
      <EraMark size={22} className="text-ash/60" />
      <p className="max-w-[30ch] text-[13px] text-ash">{children}</p>
    </div>
  );
}

/** The name in chalk. `hero`: the XI in outline, an editorial cut instead of a colour accent. */
export function Wordmark({ className = "", mark = false, hero = false }: { className?: string; mark?: boolean; hero?: boolean }) {
  return (
    <span className={`${hero ? "flex" : "inline-flex"} items-center gap-[0.2em] font-display font-extrabold uppercase leading-none tracking-[0.02em] ${className}`}>
      {mark && <EraMark size={0} className="size-[0.72em] text-chalk/70" />}
      <span>
        ERA{" "}
        {hero ? <span className="text-transparent [-webkit-text-stroke:0.022em_var(--color-chalk)]">XI</span> : "XI"}
      </span>
    </span>
  );
}

/** Settings override the system preference: data-motion="full" | "reduced" on <html>. */
export function useReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const pref = document.documentElement.dataset.motion;
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Always-available way back to the main menu. */
export function HomeButton({ onHome, className = "" }: { onHome: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onHome}
      aria-label={t("common.home")}
      title={t("common.home")}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-ash hover:bg-chalk/[0.06] hover:text-chalk ${className}`}
    >
      <svg width="19" height="19" viewBox="0 0 20 20" aria-hidden>
        <path d="M3 9.2 10 3.5l7 5.7V16a1 1 0 0 1-1 1h-3.6v-4.6H7.6V17H4a1 1 0 0 1-1-1V9.2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Confirmation before leaving when progress would be lost. */
export function ConfirmLeave({ open, title, body, onStay, onLeave }: { open: boolean; title: string; body: string; onStay: () => void; onLeave: () => void }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onStay} title={title}>
      <p className="text-[14px] text-ash-2">{body}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onStay} className="h-12 text-[18px]">
          {t("nav.stay")}
        </Button>
        <Button onClick={onLeave} className="h-12 bg-loss text-[18px] hover:bg-loss/90">
          {t("nav.leave")}
        </Button>
      </div>
    </Sheet>
  );
}

/** FR / EN / ES switch. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`flex items-center gap-0.5 rounded-full bg-chalk/[0.06] p-0.5 ${className}`} role="group" aria-label={t("common.language")}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          aria-label={LANG_NAME[l]}
          onClick={() => setLang(l)}
          className={`h-11 min-w-[44px] rounded-full px-2 text-[12px] font-bold tracking-[0.08em] ${lang === l ? "bg-chalk text-ink" : "text-ash-2 hover:text-chalk"}`}
        >
          {LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

/** "presented by …" — optional, visually subordinate. Renders nothing without a partner. */
export function SponsorLine({ slot, className = "" }: { slot: SponsorSlot; className?: string }) {
  const { t } = useI18n();
  const s = sponsorFor(slot);
  if (!s) return null;
  return <p className={`text-[11px] uppercase tracking-[0.14em] text-ash ${className}`}>{t("sponsor.presentedBy", { partner: s.partner })}</p>;
}

/** Placeholder while a lazily loaded sheet body arrives (normally prefetched, so rarely seen). */
export function SheetLoading() {
  return (
    <div className="grid h-24 place-items-center rounded-[12px] bg-chalk/[0.03] text-ash" aria-busy="true">
      <EraMark size={26} draw />
    </div>
  );
}
