import type { DrawRules } from "./rulesets";

/**
 * WEEKLY EVENTS — rotating themes that reuse the core engine: an event is a set of
 * draw-rule overrides on top of the "weekly" ruleset (classic rules), plus dates and
 * i18n keys. No separate engine, no countdown pressure: the UI only says "until Sunday".
 *
 * Schedule: an explicit dated entry wins; otherwise the ISO week picks from the rotation.
 */
export interface WeeklyEvent {
  id: string;
  /** i18n keys: event.<id>.name / event.<id>.desc */
  overrides: Partial<Pick<DrawRules, "eraFilter" | "countries" | "excludePlayers" | "championsOnly" | "maxOverall" | "pool" | "featured">>;
}

/** Ballon d'Or winners present in the dataset (player ids). */
export const BALLON_DOR_WINNERS = [
  "di-stefano", "kopa", "law", "eusebio", "bobby-charlton", "best", "rivera", "gerd-muller", "cruyff", "beckenbauer",
  "blokhin", "simonsen", "keegan", "rummenigge", "paolo-rossi", "platini", "belanov", "gullit", "van-basten", "papin",
  "matthaus", "roberto-baggio", "stoichkov", "weah", "sammer", "ronaldo", "zidane", "rivaldo", "figo", "owen",
  "nedved", "shevchenko", "ronaldinho", "cannavaro", "kaka", "cristiano-ronaldo", "messi", "modric", "benzema", "rodri",
  "dembele",
];

export const WEEKLY_EVENTS: WeeklyEvent[] = [
  { id: "the2000s", overrides: { eraFilter: { kind: "buckets", buckets: ["2000s"] } } },
  { id: "southamerica", overrides: { pool: "all", countries: ["BRA", "ARG", "URU"] } },
  { id: "noballondor", overrides: { excludePlayers: BALLON_DOR_WINNERS } },
  { id: "champions", overrides: { championsOnly: true } },
  { id: "england", overrides: { countries: ["ENG"] } },
  { id: "the1980s", overrides: { eraFilter: { kind: "buckets", buckets: ["1980s", "pre1980"] } } },
  { id: "the1990s", overrides: { eraFilter: { kind: "buckets", buckets: ["1990s"] } } },
  { id: "italy", overrides: { countries: ["ITA"] } },
  // Education theme: the draw is classic; the week spotlights the role in the Role School.
  { id: "no10", overrides: {} },
  // Engine v6 spotlights: the draw stays classic, with guaranteed rounds from the featured side(s).
  { id: "acmilan", overrides: { featured: { teams: ["ac-milan"], rounds: 2 } } },
  { id: "brazil", overrides: { featured: { countries: ["BRA"], rounds: 4 } } },
];

/**
 * What a theme adds beyond the draw — data only, no separate engine: a Role School card to
 * spotlight and a mode worth trying. (A single-club or Brazil-ONLY week isn't possible with a
 * two-eras-per-team draft rule — hence spotlights with guaranteed rounds; "Left foot" needs
 * footedness data the dataset doesn't have.)
 */
export const WEEKLY_META: Record<string, { school?: string; recommend?: string }> = {
  the2000s: { recommend: "eralock" },
  the1990s: { recommend: "eralock", school: "IF" },
  the1980s: { school: "SK" },
  southamerica: { school: "PM" },
  noballondor: { school: "B2B" },
  champions: { recommend: "champions" },
  england: { school: "TM" },
  italy: { school: "regista", recommend: "oneleague" },
  no10: { school: "PM", recommend: "iq" },
  acmilan: { school: "BPD" },
  brazil: { school: "FB", recommend: "nations" },
};

export function eventById(id: string | undefined): WeeklyEvent | null {
  return WEEKLY_EVENTS.find((e) => e.id === id) ?? null;
}

/** Explicit overrides of the rotation (e.g. a themed week around a final). Dates are UTC days, inclusive. */
export const EVENT_SCHEDULE: { id: string; start: string; end: string }[] = [];

const DAY = 86_400_000;

/** Monday 00:00 UTC of the ISO week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY);
}

export interface EventWindow {
  event: WeeklyEvent;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (inclusive)
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function currentEvent(date: Date = new Date()): EventWindow {
  const today = iso(date);
  const pinned = EVENT_SCHEDULE.find((s) => s.start <= today && today <= s.end);
  if (pinned) {
    const e = eventById(pinned.id);
    if (e) return { event: e, start: pinned.start, end: pinned.end };
  }
  const monday = weekStart(date);
  const weekIndex = Math.floor(monday.getTime() / (7 * DAY));
  const event = WEEKLY_EVENTS[((weekIndex % WEEKLY_EVENTS.length) + WEEKLY_EVENTS.length) % WEEKLY_EVENTS.length]!;
  return { event, start: iso(monday), end: iso(new Date(monday.getTime() + 6 * DAY)) };
}

/** Engine v6+: the Daily XI of a date follows that week's theme (the id travels in the config and links). */
export function dailyEventFor(day: string): string {
  return currentEvent(new Date(`${day}T12:00:00Z`)).event.id;
}

export function applyEvent(rules: DrawRules, eventId: string | undefined): DrawRules {
  const e = eventById(eventId);
  return e ? { ...rules, ...e.overrides } : rules;
}
