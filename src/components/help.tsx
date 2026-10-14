"use client";

import { createContext, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { HelpId } from "@/help/types";
import { useI18n } from "@/i18n/react";
import { Sheet, SheetLoading } from "./ui";
import { LazyHelpCenter } from "./lazy";

/**
 * HELP — one Help Center for the whole app, opened from the Home "?" or from a contextual "?"
 * (FIT, ratings, formations…) straight at the right section. Never shown unasked.
 */
const HelpCtx = createContext<(id?: HelpId | null) => void>(() => {});
export const useOpenHelp = () => useContext(HelpCtx);

export function HelpProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<{ id: HelpId | null } | null>(null);
  const openHelp = useCallback((id?: HelpId | null) => setOpen({ id: id ?? null }), []);
  const value = useMemo(() => openHelp, [openHelp]);
  return (
    <HelpCtx.Provider value={value}>
      {children}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={t("help.title")}>
        {open && (
          <Suspense fallback={<SheetLoading />}>
            <LazyHelpCenter key={open.id ?? "all"} initial={open.id} />
          </Suspense>
        )}
      </Sheet>
    </HelpCtx.Provider>
  );
}

/** A small "?" that opens Help at one section. 44 px touch target, 20 px visual. */
export function HelpDot({ id, label, className = "" }: { id: HelpId; label?: string; className?: string }) {
  const { t } = useI18n();
  const openHelp = useOpenHelp();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openHelp(id);
      }}
      aria-label={label ?? t("help.aria")}
      title={label ?? t("help.aria")}
      className={`-m-3 inline-grid size-11 shrink-0 place-items-center rounded-full text-ash-2 hover:text-chalk ${className}`}
    >
      <span className="grid size-[18px] place-items-center rounded-full border border-current font-sans text-[11px] font-bold leading-none" aria-hidden>
        ?
      </span>
    </button>
  );
}

/** A quiet text link into Help ("Understanding FIT →"), for sheets that explain a number. */
export function HelpLink({ id, label }: { id: HelpId; label: string }) {
  const openHelp = useOpenHelp();
  return (
    <button type="button" onClick={() => openHelp(id)} className="-ml-1 mb-2 flex min-h-11 items-center px-1 text-[12.5px] font-semibold text-ash-2 underline-offset-2 hover:text-chalk hover:underline">
      {label} →
    </button>
  );
}
