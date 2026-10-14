"use client";

import { lazy } from "react";
import type { Lang } from "@/i18n";
import { loadKnowledge } from "@/knowledge/catalog";
import { loadNationality } from "@/data";
import { loadEraContext } from "@/knowledge/eraContext";
import { loadHelp } from "@/help/catalog";

/**
 * Secondary surfaces, split out of the first-load bundle. Each loader is also called once the
 * app is idle (prefetchSecondary), so the chunks are in the HTTP / service-worker cache before
 * anyone taps — solo play never needs the network after the first load.
 */
const loaders = {
  analysis: () => import("./AnalysisSheet"),
  duel: () => import("./DuelApp").then((m) => ({ default: m.DuelApp })),
  settings: () => import("./SettingsSheet").then((m) => ({ default: m.SettingsSheet })),
  // The Passport counts nationalities: it resolves only once that table (its own chunk) is in.
  passport: () => Promise.all([import("./PassportSheet"), loadNationality(), loadEraContext()]).then(([m]) => ({ default: m.PassportView })),
  gallery: () => import("./GalleryView").then((m) => ({ default: m.GalleryView })),
  school: () => import("./KnowledgeViews").then((m) => ({ default: m.RoleSchoolView })),
  help: () => import("./HelpCenter"),
  myera: () => import("./MyEra").then((m) => ({ default: m.MyEraView })),
};

export const LazyAnalysisSheet = lazy(loaders.analysis);
export const LazyDuelApp = lazy(loaders.duel);
export const LazySettingsSheet = lazy(loaders.settings);
export const LazyPassportView = lazy(loaders.passport);
export const LazyGalleryView = lazy(loaders.gallery);
export const LazyRoleSchoolView = lazy(loaders.school);
export const LazyHelpCenter = lazy(loaders.help);
export const LazyMyEraView = lazy(loaders.myera);

let prefetched = false;
/** Also warms the Knowledge Layer catalog of the current language (its own chunk). */
export function prefetchSecondary(lang?: Lang): void {
  if (prefetched || typeof window === "undefined") return;
  prefetched = true;
  const run = () => {
    for (const load of Object.values(loaders)) void load().catch(() => (prefetched = false));
    if (lang) void loadKnowledge(lang).catch(() => {});
    // Nationalities feed end-of-run discoveries and the Passport, never the draft itself.
    void loadNationality().catch(() => {});
    // Era context (coaches, honours) for the Passport and profiles; Help text for the language.
    void loadEraContext().catch(() => {});
    if (lang) void loadHelp(lang).catch(() => {});
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
