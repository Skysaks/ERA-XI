/**
 * ERA CONTEXT — structured, sourced facts about a team era (never prose): who coached it, what it
 * won inside its span, and — only where the style is widely documented — one tactical identity tag
 * from a closed list. The UI renders these through localized templates (FR/EN/ES), so nothing is
 * machine-translated and nothing is generated.
 */
export type HonourCode =
  | "league" // domestic league title (season END year)
  | "cup" // main domestic cup (final year)
  | "ucl" // European Cup / Champions League
  | "uefa-cup" // UEFA Cup / Europa League
  | "cwc" // European Cup Winners' Cup
  | "libertadores"
  | "caf-cl" // CAF Champions League / African Cup of Champions Clubs
  | "afc-cl" // AFC Champions League / Asian Club Championship
  | "concacaf-cl" // CONCACAF Champions' Cup / Champions League
  | "intercontinental" // Intercontinental Cup / FIFA Club World Cup
  | "world-cup"
  | "euro"
  | "copa-america"
  | "afcon"
  | "asian-cup"
  | "gold-cup"
  | "olympics";

export type StyleTag =
  | "pressing" // organised high pressing (Sacchi, Klopp…)
  | "possession" // positional possession play (Cruyff's Barça, Guardiola…)
  | "total-football"
  | "catenaccio" // libero + man-marking, deep defence
  | "counter" // defend deep, strike on the break
  | "direct" // long balls, second balls, aerial play
  | "wing-play" // width and crosses as the main weapon
  | "flair" // individual improvisation (jogo bonito…)
  | "defensive"; // low block, organisation first

export interface EraMetaRaw {
  /** Head coach(es) during the span, most important first (max 2). */
  coach: string[];
  /** Honours WON inside [start, end+1], as [code, year]. Empty when none. */
  honours: [HonourCode, number][];
  /** Only when the style is widely documented for THIS side. */
  style?: StyleTag;
  /** URL(s) checked for coach and honours. */
  src: string[];
}
