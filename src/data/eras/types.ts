/** Compact authoring format for one team era. */
export interface RawEra {
  team: string;
  label: string;
  start: number;
  end: number;
  /** Years (final's calendar year) this squad won the European Cup / Champions League. Clubs only. */
  euro?: number[];
  /** "Name|POS POS|level|ROLE|overrides|optionalId" — first position is natural. */
  players: string[];
}
