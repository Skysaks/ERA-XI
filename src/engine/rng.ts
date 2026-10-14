/**
 * Deterministic seeded randomness. Gameplay code must use this, never Math.random.
 * cyrb128 string hash → sfc32 generator. Fast, well distributed, reproducible
 * across JS engines (only 32-bit integer ops).
 */

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** integer in [0, n) */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** Index chosen proportionally to weights (all ≥ 0, at least one > 0). */
  weightedIndex(weights: readonly number[]): number;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: string): Rng {
  const [a, b, c, d] = cyrb128(seed);
  const next = sfc32(a, b, c, d);
  // Warm up: discard first outputs for better diffusion of similar seeds.
  for (let i = 0; i < 12; i++) next();

  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error("rng.pick on empty array");
      return items[int(items.length)] as T;
    },
    weightedIndex(weights) {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return int(weights.length);
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i] ?? 0);
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
  };
}

/** Independent sub-stream: same seed + same labels → same sequence. */
export function rngFor(seed: string, ...labels: (string | number)[]): Rng {
  return createRng([seed, ...labels].join("|"));
}

/** Stable 32-bit hash, handy for deriving seeds (e.g. Daily XI). */
export function hashString(input: string): number {
  return cyrb128(input)[0];
}

const SEED_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Seed string from a 32-bit integer source; 8 chars ≈ 40 bits. */
export function seedFromInts(ints: readonly number[]): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    const v = ints[i % ints.length] ?? 0;
    out += SEED_ALPHABET[(v >>> (i * 3)) % SEED_ALPHABET.length];
  }
  return out;
}

/** Deterministic seed for a label (Daily XI). */
export function seedFromLabel(label: string): string {
  return seedFromInts(cyrb128(label));
}

/**
 * Fresh seed for a new game. Uses crypto when available; this is seed creation,
 * not gameplay randomness, so reproducibility is not required here.
 */
export function freshSeed(): string {
  const buf = new Uint32Array(4);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(buf);
  } else {
    const t = Date.now();
    buf[0] = t >>> 0;
    buf[1] = hashString(String(t));
  }
  return seedFromInts(cyrb128(Array.from(buf).join("-")));
}
