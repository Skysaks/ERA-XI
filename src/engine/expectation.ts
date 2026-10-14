/**
 * SEASON EXPECTATION — the exact points distribution of a team's season, before (or
 * without) simulating it. Each match is integrated over the model's own randomness
 * (form swing + Poisson goals), then a dynamic programme over 38 matches gives
 * P(points = k) for k = 0…114. Deterministic, no sampling noise.
 *
 * Used for: Analysis ("expected range 96–104"), turning-point estimates (season impact
 * of an alternative pick), and calibration (P(114) for a perfect XI is computed, not
 * guessed from a handful of samples).
 */
export interface MatchProbs {
  win: number;
  draw: number;
  loss: number;
}

const MAX_GOALS = 12;

function poissonPmf(lambda: number): number[] {
  const out = new Array<number>(MAX_GOALS + 1);
  let p = Math.exp(-lambda);
  let total = 0;
  for (let k = 0; k <= MAX_GOALS; k++) {
    out[k] = p;
    total += p;
    p *= lambda / (k + 1);
  }
  // Fold the (tiny) tail into the last bucket so the pmf sums to 1 — mirrors the capped sampler.
  out[MAX_GOALS] = out[MAX_GOALS]! + (1 - total);
  return out;
}

/** W/D/L probabilities for two independent Poisson scores. */
export function poissonOutcome(lambdaFor: number, lambdaAgainst: number): MatchProbs {
  const f = poissonPmf(lambdaFor);
  const a = poissonPmf(lambdaAgainst);
  let win = 0, draw = 0;
  const cumA: number[] = [];
  let c = 0;
  for (let k = 0; k <= MAX_GOALS; k++) {
    c += a[k]!;
    cumA.push(c);
  }
  for (let g = 0; g <= MAX_GOALS; g++) {
    const pf = f[g]!;
    draw += pf * a[g]!;
    if (g > 0) win += pf * cumA[g - 1]!;
  }
  return { win, draw, loss: Math.max(0, 1 - win - draw) };
}

/** Gauss–Legendre nodes on [-1, 1] (9 points): integrates the uniform form swing. */
const GL_X = [0, -0.3242534234038089, 0.3242534234038089, -0.6133714327005904, 0.6133714327005904, -0.8360311073266358, 0.8360311073266358, -0.9681602395076261, 0.9681602395076261];
const GL_W = [0.3302393550012598, 0.3123470770400029, 0.3123470770400029, 0.2606106964029354, 0.2606106964029354, 0.1806481606948574, 0.1806481606948574, 0.0812743883615744, 0.0812743883615744];

/** Average match probabilities over a form swing uniform on [-amp, +amp]. */
export function integrateForm(amp: number, at: (form: number) => MatchProbs): MatchProbs {
  if (amp <= 0) return at(0);
  let win = 0, draw = 0, loss = 0;
  for (let i = 0; i < GL_X.length; i++) {
    const p = at(GL_X[i]! * amp);
    const w = GL_W[i]! / 2;
    win += p.win * w;
    draw += p.draw * w;
    loss += p.loss * w;
  }
  return { win, draw, loss };
}

export interface PointsDistribution {
  /** pmf[k] = P(points = k), k = 0…3·matches. */
  pmf: number[];
  expected: number;
  /** Central 80% interval (10th–90th percentile). */
  low: number;
  high: number;
  /** P(points ≥ k) helper. */
  atLeast(k: number): number;
}

export function seasonDistribution(matches: readonly MatchProbs[]): PointsDistribution {
  const max = matches.length * 3;
  let pmf = new Array<number>(max + 1).fill(0);
  pmf[0] = 1;
  for (const m of matches) {
    const next = new Array<number>(max + 1).fill(0);
    for (let k = 0; k <= max; k++) {
      const p = pmf[k]!;
      if (p === 0) continue;
      next[k] = next[k]! + p * m.loss;
      if (k + 1 <= max) next[k + 1] = next[k + 1]! + p * m.draw;
      if (k + 3 <= max) next[k + 3] = next[k + 3]! + p * m.win;
    }
    pmf = next;
  }
  const expected = matches.reduce((a, m) => a + 3 * m.win + m.draw, 0);
  const quantile = (q: number) => {
    let c = 0;
    for (let k = 0; k <= max; k++) {
      c += pmf[k]!;
      if (c >= q) return k;
    }
    return max;
  };
  const tail = new Array<number>(max + 2).fill(0);
  for (let k = max; k >= 0; k--) tail[k] = tail[k + 1]! + pmf[k]!;
  return { pmf, expected, low: quantile(0.1), high: quantile(0.9), atLeast: (k: number) => (k <= 0 ? 1 : k > max ? 0 : tail[k]!) };
}
