/**
 * ERA CONTEXT — "AC Milan 1987–1991: European Cup 1989, 1990 · Serie A 1988 · Arrigo Sacchi ·
 * pressing". Built from structured, sourced data (src/data/eraMeta) through localized templates;
 * never generated prose. The data is its own lazy chunk, off the draft path.
 */
import { useEffect, useState } from "react";
import type { EraMetaRaw, HonourCode } from "@/data/eraMeta/types";
import type { KnowledgeT } from "./catalog";

let meta: Record<string, EraMetaRaw> | null = null;
let loading: Promise<void> | null = null;

export function loadEraContext(): Promise<void> {
  loading ??= import("@/data/eraMeta").then(
    (m) => {
      meta = m.ERA_META;
    },
    (e: unknown) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

export const eraContextReady = () => meta !== null;

export function eraMetaOf(eraId: string): EraMetaRaw | null {
  return meta?.[eraId] ?? null;
}

/** Most prestigious first: what a fan would say first about the side. */
const ORDER: HonourCode[] = ["world-cup", "euro", "copa-america", "afcon", "asian-cup", "gold-cup", "olympics", "ucl", "libertadores", "caf-cl", "afc-cl", "concacaf-cl", "intercontinental", "league", "uefa-cup", "cwc", "cup"];

export interface HonourGroup {
  code: HonourCode;
  years: number[];
}

export function honourGroups(m: EraMetaRaw): HonourGroup[] {
  const by = new Map<HonourCode, number[]>();
  for (const [code, year] of m.honours) by.set(code, [...(by.get(code) ?? []), year]);
  return ORDER.filter((c) => by.has(c)).map((code) => ({ code, years: [...new Set(by.get(code)!)].sort((a, b) => a - b) }));
}

/** One or two short localized lines; null when the era has no recorded context. */
export function eraContextLines(kt: KnowledgeT, eraId: string, maxGroups = 3): { honours: string | null; coach: string | null; style: string | null } | null {
  const m = eraMetaOf(eraId);
  if (!m) return null;
  const groups = honourGroups(m).slice(0, maxGroups);
  const honours = groups.length
    ? groups.map((g) => kt(`ctx.h.${g.code}`, { years: g.years.join(", "), n: g.years.length })).join(" · ")
    : null;
  const coach = m.coach.length ? kt(m.coach.length > 1 ? "ctx.coaches" : "ctx.coach", { name: m.coach.join(", ") }) : null;
  const style = m.style ? kt(`ctx.style.${m.style}`) : null;
  return honours || coach || style ? { honours, coach, style } : null;
}

/** React: load the era context on first use (it is prefetched when idle anyway). */
export function useEraContextReady(): boolean {
  const [ready, setReady] = useState(eraContextReady());
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void loadEraContext()
      .then(() => alive && setReady(true))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}
