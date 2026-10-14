/**
 * HELP CENTER — short first, expandable for depth. Each language is its own lazy chunk (never on
 * the first paint). Vocabulary follows docs/glossary.md; proper nouns are never translated.
 */
export const HELP_IDS = ["howto", "ratings", "fit", "positions", "formations", "modes", "daily", "challenges", "league", "roles", "glossary"] as const;
export type HelpId = (typeof HELP_IDS)[number];

export interface HelpSection {
  id: HelpId;
  title: string;
  /** Two or three sentences: enough for a first-timer. */
  short: string;
  /** Depth for the curious, one idea per line. */
  more: string[];
}

export interface HelpCatalog {
  intro: string;
  sections: HelpSection[];
  glossary: [term: string, definition: string][];
  ui: { more: string; less: string; school: string; allTopics: string };
}

export const isHelpId = (v: unknown): v is HelpId => typeof v === "string" && (HELP_IDS as readonly string[]).includes(v);
