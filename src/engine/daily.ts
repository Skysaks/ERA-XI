import { seedFromLabel } from "./rng";

/** Same seed for everyone on a given UTC day. */
export function dailyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dailySeed(key: string): string {
  return seedFromLabel(`daily:${key}`);
}
