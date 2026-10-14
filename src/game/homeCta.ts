import type { StoredProfile } from "./storage";
import type { ResumeRecord } from "./resume";

/**
 * CONTEXTUAL HOME CTA — one primary action, the most relevant for this player right now.
 * Never several competing primaries; everything else stays one tap away as secondary.
 * Order: finish what you started → answer a rival → today's Daily → a near miss → play.
 */
export type HomeCta =
  | { kind: "play" }
  | { kind: "resume"; picks: number; daily: boolean }
  | { kind: "rematch"; rival: string; yours: number; theirs: number }
  | { kind: "daily" }
  | { kind: "beat"; best: number; gap: number };

const HOUR = 3_600_000;
export const REMATCH_WINDOW_H = 72;
export const BEAT_WINDOW_H = 48;
export const BEAT_MAX_GAP = 5;

export function homeCta(p: StoredProfile, resume: ResumeRecord | null, today: string | null, now: number): HomeCta {
  if (resume && resume.picks.length > 0) return { kind: "resume", picks: resume.picks.length, daily: Boolean(resume.config.daily) };
  if (p.games === 0) return { kind: "play" };

  // A named friend beat you recently and you have not answered yet.
  const loss = [...p.challenges]
    .filter((c) => !c.duel && c.opponent.trim() && c.opponent.toLowerCase() !== "friend" && now - c.at < REMATCH_WINDOW_H * HOUR && c.theirs > c.yours)
    .sort((a, b) => b.at - a.at)[0];
  if (loss) {
    const answered = p.recent.some((r) => r.at > loss.at && r.rival?.toLowerCase() === loss.opponent.toLowerCase());
    const replayedSince = p.challenges.some((c) => c.at > loss.at && c.opponent.toLowerCase() === loss.opponent.toLowerCase());
    if (!answered && !replayedSince) return { kind: "rematch", rival: loss.opponent, yours: loss.yours, theirs: loss.theirs };
  }

  // Today's Daily, once the habit exists (never pushed on a first session).
  if (today && !p.daily[today] && p.games >= 2) return { kind: "daily" };

  // Just missed the record: say it with the number.
  const last = p.recent[0];
  const best = p.records.bestPoints;
  if (last && best !== null && best >= 60 && now - last.at < BEAT_WINDOW_H * HOUR && last.mode !== "gauntlet") {
    const gap = best - last.points;
    if (gap > 0 && gap <= BEAT_MAX_GAP) return { kind: "beat", best, gap };
  }
  return { kind: "play" };
}
