import type { DraftConfig, DraftState, FormationId } from "@/types";
import { SUPPORTED_ENGINE_VERSIONS, createDraft, isDraftComplete, layoutOf, pickOption, reroll } from "@/engine";

/**
 * Resumable solo run. Going Home (or closing the tab, or pressing Back) never destroys
 * an unfinished draft: it is saved here after every decision and offered as RESUME DRAFT.
 * Stored as decisions only (seed + picks), so it is tiny and replays deterministically.
 */
export interface ResumeRecord {
  v: 1;
  config: DraftConfig;
  picks: number[];
  rerollRound: number | null;
  /** Manual layout on the complete XI (slot → round), if any. */
  layout: number[] | null;
  challengeToken: string | null;
  rival: string | null;
  startedAt: number;
  savedAt: number;
  /** Engine v4: formation chosen after the draft. */
  formation?: FormationId;
  /** Practice run (replay from a round): never recorded as official. */
  practice?: boolean;
}

const KEY = "eraxi:resume";

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function toResume(draft: DraftState, ctx: { challengeToken: string | null; rival: string | null; startedAt: number; practice?: boolean }): ResumeRecord {
  return {
    ...(draft.formation ? { formation: draft.formation } : {}),
    ...(ctx.practice ? { practice: true } : {}),
    v: 1,
    config: draft.config,
    picks: draft.picks.map((p) => p.optionIndex),
    rerollRound: draft.rerollRound,
    layout: isDraftComplete(draft) ? layoutOf(draft) : draft.picks.length ? layoutOf(draft) : null,
    challengeToken: ctx.challengeToken,
    rival: ctx.rival,
    startedAt: ctx.startedAt,
    savedAt: Date.now(),
  };
}

export function saveResume(r: ResumeRecord | null): void {
  const s = store();
  try {
    if (r) s?.setItem(KEY, JSON.stringify(r));
    else s?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadResume(): ResumeRecord | null {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as ResumeRecord;
    if (r?.v !== 1 || !r.config || !Array.isArray(r.picks)) return null;
    if (!SUPPORTED_ENGINE_VERSIONS.includes(r.config.engineVersion)) return null;
    return r;
  } catch {
    return null;
  }
}

/** Rebuild the draft exactly where it was left (null if it no longer replays). */
export function restoreDraft(r: ResumeRecord): DraftState | null {
  try {
    let s = createDraft(r.config);
    for (let i = 0; i < r.picks.length; i++) {
      if (r.rerollRound === i) s = reroll(s);
      s = pickOption(s, r.picks[i]!).state;
    }
    if (r.rerollRound !== null && r.rerollRound === r.picks.length && !isDraftComplete(s)) s = reroll(s);
    if (r.formation && isDraftComplete(s) && r.formation !== s.config.formation) s = { ...s, formation: r.formation };
    if (r.layout) {
      // Mid-draft manual moves and the final layout are both kept (slot → round of the player).
      const picks = s.picks;
      s = { ...s, lineup: r.layout.map((round) => (round >= 0 ? picks[round]?.playerEraId ?? null : null)) };
    }
    return s;
  } catch {
    return null;
  }
}

