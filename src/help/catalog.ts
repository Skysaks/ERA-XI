"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/i18n";
import type { HelpCatalog } from "./types";

/** One lazy chunk per language, fetched when Help first opens (and prefetched when idle). */
const loaders: Record<Lang, () => Promise<HelpCatalog>> = {
  en: () => import("./en").then((m) => m.helpEn),
  fr: () => import("./fr").then((m) => m.helpFr),
  es: () => import("./es").then((m) => m.helpEs),
};
const cache = new Map<Lang, HelpCatalog>();

export function loadHelp(lang: Lang): Promise<HelpCatalog> {
  const hit = cache.get(lang);
  if (hit) return Promise.resolve(hit);
  return loaders[lang]().then((c) => {
    cache.set(lang, c);
    return c;
  });
}

export function useHelpCatalog(lang: Lang): HelpCatalog | null {
  const [c, setC] = useState<HelpCatalog | null>(() => cache.get(lang) ?? null);
  useEffect(() => {
    let alive = true;
    void loadHelp(lang)
      .then((x) => alive && setC(x))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lang]);
  return c;
}
