/**
 * FORM — active days over the last seven (● ● ● ○ ● ● ○ 5/7). Non-punitive: a missed
 * day costs one dot, never an accumulated streak. Streaks are computed separately
 * (`currentStreak`) so they can be tested later without being shown now.
 */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addActivity(days: readonly string[], today: string): string[] {
  if (days.includes(today)) return [...days];
  return [...days, today].sort().slice(-60);
}

/** Oldest → newest, 7 booleans ending today. */
export function formDots(days: readonly string[], now: Date = new Date()): boolean[] {
  const set = new Set(days);
  const out: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(set.has(localDay(d)));
  }
  return out;
}

/** Consecutive active days ending today or yesterday (architecture only; not displayed). */
export function currentStreak(days: readonly string[], now: Date = new Date()): number {
  const set = new Set(days);
  let n = 0;
  let i = set.has(localDay(now)) ? 0 : 1;
  for (;;) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (!set.has(localDay(d))) break;
    n++;
    i++;
  }
  return n;
}
