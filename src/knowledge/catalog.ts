"use client";

import { useEffect, useState } from "react";
import type { Lang } from "@/i18n";

/**
 * Knowledge Layer catalogs live in their own chunks (one per language) and are fetched on
 * demand — prefetched when the app is idle — so educational content never weighs on the
 * first paint. Returns null until loaded: callers simply show nothing meanwhile.
 */
const loaders: Record<Lang, () => Promise<Record<string, string>>> = {
  en: () => import("./i18n/en").then((m) => m.knowledgeEn),
  fr: () => import("./i18n/fr").then((m) => m.knowledgeFr),
  es: () => import("./i18n/es").then((m) => m.knowledgeEs),
};
const cache = new Map<Lang, Record<string, string>>();
const pending = new Map<Lang, Promise<Record<string, string>>>();

export function loadKnowledge(lang: Lang): Promise<Record<string, string>> {
  const hit = cache.get(lang);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(lang);
  if (!p) {
    p = loaders[lang]().then((c) => {
      cache.set(lang, c);
      return c;
    });
    pending.set(lang, p);
  }
  return p;
}

export type KnowledgeT = (key: string, params?: Record<string, string | number>) => string;

function translator(c: Record<string, string>): KnowledgeT {
  return (key, params) => {
    const s = c[key];
    if (s === undefined) return "";
    return params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? "")) : s;
  };
}

export function useKnowledge(lang: Lang): KnowledgeT | null {
  const [c, setC] = useState<Record<string, string> | null>(() => cache.get(lang) ?? null);
  useEffect(() => {
    let alive = true;
    const hit = cache.get(lang);
    if (hit) setC(hit);
    else
      void loadKnowledge(lang)
        .then((x) => alive && setC(x))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lang]);
  return c ? translator(c) : null;
}
