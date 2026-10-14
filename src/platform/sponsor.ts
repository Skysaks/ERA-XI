/**
 * Sponsorship surfaces — optional, subordinate to ERA XI, never inside the loop.
 * Allowed slots only; the Draft, the picks, the pre-simulation moment and rerolls are
 * structurally excluded (there is no slot id for them). No forced video, ever.
 */
export type SponsorSlot = "home" | "daily" | "result";

export interface Sponsor {
  slot: SponsorSlot;
  /** Plain text partner name ("presented by …"). No tracking pixels, no third-party scripts. */
  partner: string;
  /** Optional ISO dates. */
  start?: string;
  end?: string;
}

/** Empty in this build: no partner is configured, so nothing renders. */
export const SPONSORS: Sponsor[] = [];

export function sponsorFor(slot: SponsorSlot, today = new Date().toISOString().slice(0, 10)): Sponsor | null {
  return SPONSORS.find((s) => s.slot === slot && (!s.start || s.start <= today) && (!s.end || today <= s.end)) ?? null;
}
