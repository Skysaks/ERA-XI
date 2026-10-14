/**
 * Player settings (local). Progressive disclosure in the UI: GAME / EXPERIENCE / ACCOUNT.
 * Competitive rules win over preferences: see `effectiveSettings`.
 */
export type SimSpeed = "live" | "fast" | "instant";
export type Motion = "system" | "full" | "reduced";
/** Knowledge Layer: MINIMAL = pure gameplay, STANDARD = short insights after some picks, DEEP = every pick + richer profiles. */
export type KnowledgeLevel = "minimal" | "standard" | "deep";

export interface NotificationPrefs {
  daily: boolean;
  challenge: boolean;
  duel: boolean;
  weekly: boolean;
}

export interface Settings {
  simSpeed: SimSpeed;
  knowledge: KnowledgeLevel;
  /** Pick impact toasts and FIT deltas on options. */
  hints: boolean;
  /** "→ LW" landing chips and the pitch preview. */
  preview: boolean;
  /** Pick popularity after the choice (only when real data exists). */
  postPickStats: boolean;
  /** Keep unfinished solo drafts and offer RESUME on Home. */
  resume: boolean;
  sound: boolean;
  haptics: boolean;
  motion: Motion;
  highContrast: boolean;
  largeText: boolean;
  /** Anonymous product analytics (no personal data). */
  analytics: boolean;
  leaderboards: boolean;
  publicProfile: boolean;
  notifications: NotificationPrefs;
}

export const DEFAULT_SETTINGS: Settings = {
  simSpeed: "live",
  knowledge: "standard",
  hints: true,
  preview: true,
  postPickStats: true,
  resume: true,
  sound: false,
  haptics: true,
  motion: "system",
  highContrast: false,
  largeText: false,
  analytics: true,
  leaderboards: false,
  publicProfile: false,
  notifications: { daily: false, challenge: false, duel: false, weekly: false },
};

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  const n = (r.notifications ?? {}) as Partial<NotificationPrefs>;
  return {
    simSpeed: r.simSpeed === "fast" || r.simSpeed === "instant" ? r.simSpeed : "live",
    knowledge: r.knowledge === "minimal" || r.knowledge === "deep" ? r.knowledge : "standard",
    hints: bool(r.hints, d.hints),
    preview: bool(r.preview, d.preview),
    postPickStats: bool(r.postPickStats, d.postPickStats),
    resume: bool(r.resume, d.resume),
    sound: bool(r.sound, d.sound),
    haptics: bool(r.haptics, d.haptics),
    motion: r.motion === "full" || r.motion === "reduced" ? r.motion : "system",
    highContrast: bool(r.highContrast, d.highContrast),
    largeText: bool(r.largeText, d.largeText),
    analytics: bool(r.analytics, d.analytics),
    leaderboards: bool(r.leaderboards, d.leaderboards),
    publicProfile: bool(r.publicProfile, d.publicProfile),
    notifications: { daily: bool(n.daily, false), challenge: bool(n.challenge, false), duel: bool(n.duel, false), weekly: bool(n.weekly, false) },
  };
}

/**
 * Competitive integrity: in an official Daily XI attempt everyone decides with the same
 * information, so draft aids that change what you see while choosing (impact hints,
 * placement preview) are pinned on. Presentation-only settings (simulation speed, motion,
 * sound) never change a result and stay free. Live rooms use the defaults outright.
 */
export function effectiveSettings(s: Settings, context: { competitive: boolean }): Settings {
  if (!context.competitive) return s;
  return { ...s, hints: true, preview: true };
}
