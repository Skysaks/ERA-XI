# ERA XI — season model calibration (engines v4, v5 and v6)

Every number below is measured, not assumed. Tools:

- `scripts/calibration.ts` — N synthetic drafts per drafting policy × K sampled seasons each, plus the
  **exact** points distribution of every drafted team (expectation DP, `src/engine/expectation.ts`).
  Grouped by overall / FIT / ATT / MID / DEF / GK / out-of-position count.
  `node scripts/run-ts.mjs scripts/calibration.ts <engine> <drafts> <seasons>`
- `scripts/calibration-diagnose.ts` — holds a population of competently drafted XIs fixed and changes one
  factor of the model at a time (exact expectation).
- `scripts/calibration-search.ts` — parameter grid for the v4 model, same population, exact expectation.
- `scripts/calibration-v4-diagnose.ts` — v4 per-factor diagnosis (draft quality, solvability protection, FIT,
  arrangement, opponents, expected-goals scale, variance), exact expectation on 500 competent XIs.
- `scripts/director-audit.ts` — is each round a real decision, and is the positional route always offered?
  Every option of every offer is valued by a rollout (take it, finish competently, exact expected points).

- `scripts/diversity-audit.ts` — who is actually offered: player / tier / role / team-era exposure over
  thousands of drafts (`<drafts> <engine>`).

Full reports: `docs/calibration-v3-report.md`, `docs/calibration-v4-report.md`, `docs/calibration-v5-report.md`,
`docs/calibration-v6-report.md` (100,000 sampled seasons each), `docs/calibration-v4-diagnosis.md`, `docs/director-audit.md` (v5 then v4),
`docs/diversity-audit.md`.

## Drafting policies (synthetic players)

| policy | how it picks |
|---|---|
| random | any option |
| greedy | always the highest rating ("just take the best player") |
| novice | highest rating that lands in position, otherwise highest rating |
| competent | overall × players + FIT, keeper-aware |
| expert | team strength (attack + defence indices) + FIT, keeper-aware |

## 1. Diagnosis of v3 (why ~150 human runs gave a best of 110 and few 100+)

Measured on 600 competent v3 XIs (exact expectation):

| variant | exp. pts | ≥100 | ≥105 | ≥110 | 114 |
|---|---|---|---|---|---|
| v3 as shipped | 82.0 | 2.37% | 0.34% | 0.020% | 0.0006% |
| FIT penalty removed (FIT = 100) | 87.4 | 6.46% | 1.13% | 0.074% | 0.0026% |
| opponents −3 (weaker league) | 92.5 | 20.24% | 5.53% | 0.61% | 0.032% |
| no form swing | 82.1 | 2.44% | 0.36% | 0.021% | 0.0007% |
| steeper strength mapping (K 0.09) | 87.1 | 8.97% | 2.01% | 0.18% | 0.0089% |
| team +3 on every line | 91.1 | 15.84% | 3.95% | 0.39% | 0.019% |

- **Draft generation was the first cause.** The best XI a hindsight beam search could build from the same
  offers averaged overall 86.6 / FIT 91.8 / 0.57 out of position; competent play reached 85.6 / 85.7 / 1.28.
  The offers themselves left too little to build with (naive random options, frequent forced positions).
- **Opponent strength vs team scale was the largest model lever:** a drafted all-star XI sat level with
  the league's giants (best competent XI won 65% of games against giants).
- **Match variance was not the problem:** removing the form swing changed nothing (+0.1 pt).
- **FIT penalties were real but secondary** (+5.4 pts if removed entirely).

v3 measured distribution (competent): mean 81.6 · ≥100 2.2% · ≥105 0.28% · ≥110 0.01% · 114 ≈ 1 in 200,000.

## 2. What v4 changed (in this order)

1. **Draft Director** (`src/engine/director.ts`): structured, solvable offers. Alone, with the v3 match model,
   it moved competent drafting from 82.0 to 87.8 and ≥100 from 2.4% to 7.4%.
2. **FIT v2**: explainable role relationships (±, bounded −10…+6).
3. **Season model v4** (`eraLeagueV4`, parameters chosen from the grid in `calibration-search.ts`):
   league scale 2.5 below drafted XIs (was 2), strength mapping K 0.076 (was 0.072), and **elite control**:
   the more elite the XI (average index above 88), the less its superiority leaks into opponent chances and
   the smaller its form swing. Same structure otherwise: seeded league, common random numbers, Poisson goals.

## 3. Measured v4 distribution (V1.6 re-run: 4,000 drafts × 5 seasons per policy = 100,000 sampled seasons)

Sampled seasons:

| policy | mean | p10 | p50 | p90 | <80 | 80–89 | 90–99 | ≥100 | ≥105 | ≥110 | ≥111 | ≥112 | =113 | 114 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| random | 48.1 | 19 | 47 | 79 | 90.7% | 7.2% | 2.0% | 0.18% | 0.04% | 0.005% | 0 | 0 | 0 | 0 |
| greedy (highest rating) | 33.2 | 11 | 29 | 61 | 97.6% | 1.6% | 0.56% | 0.15% | 0.04% | 0.005% | 0.005% | 0 | 0 | 0 |
| novice | 79.8 | 58 | 82 | 97 | 41.9% | 28.7% | 23.5% | 5.9% | 1.4% | 0.16% | 0.07% | 0.06% | 0 | 0.01% |
| competent | 90.6 | 79 | 91 | 101 | 10.0% | 32.1% | 43.5% | 14.4% | 3.5% | 0.34% | 0.15% | 0.08% | 0 | 0.01% |
| expert | 89.2 | 77 | 90 | 100 | 14.0% | 34.5% | 40.1% | 11.4% | 2.6% | 0.21% | 0.10% | 0.07% | 0 | 0.005% |

Exact tails (expectation DP over every drafted XI — no sampling noise, resolves the rare tail):

| policy | exact mean | ≥100 | ≥105 | ≥110 | ≥111 | ≥112 | 114 |
|---|---|---|---|---|---|---|---|
| novice | 79.8 | 5.9% | 1.3% | 0.12% | 0.05% | 0.03% | 0.006% |
| competent | 90.7 | 14.8% | 3.7% | 0.36% | 0.15% | 0.10% | 0.02% |
| expert | 89.2 | 11.3% | 2.5% | 0.23% | 0.10% | 0.06% | 0.01% |

W/D/L, goals and every grouping (overall, FIT, ATT, MID, DEF, GK, out of position) are in `docs/calibration-v4-report.md`.
By overall (all policies): 86–87 → 89.1 mean, 9.5% ≥100; 88–89 → 96.0, 31.9% ≥100, 1.0% ≥110; 90–91 → 101.4,
63% ≥100, 4.9% ≥110, 0.34% for 114.

Reference XIs (exact, 200 seeds):

| XI | overall | FIT | exp. pts | ≥100 | ≥110 | 114 |
|---|---|---|---|---|---|---|
| perfect: elite and coherent | 93 | 98 | 107.9 | 98.2% | 37.6% | **5.6%** |
| great | 90 | 94 | 101.1 | 64.1% | 3.6% | 0.19% |
| perfect names, poor fit | 93 | 70 | 99.2 | 49.8% | 1.7% | 0.07% |
| typical competent | 87 | 92 | 92.0 | 10.8% | 0.07% | 0.0014% |

Against the design hypotheses (competent drafting):

| hypothesis | measured | read |
|---|---|---|
| <80 poor / broken | 10.0% | mostly XIs with 2+ players out of position or no keeper |
| 80–89 ordinary | 32.1% | |
| 90–99 good | 43.5% | competent median: 91 |
| 100+ meaningfully strong | 14.4% (exact 14.8%) | ~1 season in 7 |
| 105+ excellent | 3.5% (exact 3.7%) | ~1 in 27 |
| 110+ rare | 0.34% (exact 0.36%) | ~1 in 280 |
| 112 (the real "exceptional") | 0.08% (exact 0.10%) | ~1 in 1,000 |
| 113 exceptional | — | **impossible**: 3 pts per win, 1 per draw → 112 (37W 1D) then 114 |
| 114 mythic but attainable | 0.01% sampled, 0.02% exact (≈1 in 5,000); 5.5% for a perfect XI, 0.34% for 90–91 overall XIs | earned by construction, not by impossible luck |

What decides a season (v4, all policies): 0 players out of position → 91.5 mean; 2 → 73.4; 4–5 → 42.5.
FIT ≥ 95 → 93.1; FIT 70–79 → 79.5. "Perfect names, poor fit" (93 overall, FIT 70) expects 99.2 against 107.9
for the same quality with FIT 98: construction is worth about 9 points at the top.
Choosing the highest rating every round (greedy) averages 33.

## 4. v4 per-factor diagnosis (500 competent XIs, exact expectation, one factor at a time)

| factor changed | exp. pts | ≥100 | ≥110 | 114 |
|---|---|---|---|---|
| **v4 as shipped** | 90.7 | 15.4% | 0.38% | 0.02% |
| naive draw (no Director), same seeds | 85.0 | 5.9% | 0.10% | 0.004% |
| Director without solvability protection | 90.8 | 15.5% | 0.39% | 0.02% |
| hindsight ceiling (best XI the offers allowed) | 96.9 | 36.8% | 1.5% | 0.09% |
| OPTIMISE XI applied after the draft | 92.5 | 20.5% | 0.68% | 0.04% |
| FIT penalty removed | 93.8 | 23.6% | 0.77% | 0.04% |
| opponents −2 / +2 | 97.0 / 83.3 | 40.0% / 3.4% | 2.5% / 0.03% | 0.18% / 0.0009% |
| goal scale ×0.9 / ×1.15 | 89.2 / 92.5 | 11.3% / 21.3% | 0.22% / 0.72% | 0.009% / 0.04% |
| no form swing / double swing | 90.8 / 90.4 | 15.7% / 14.3% | 0.40% / 0.34% | 0.02% / 0.02% |

Reading:
- **Draft quality is the lever the player controls**: the Director is worth +5.7 expected points over a naive draw;
  the gap between competent play and the hindsight ceiling is another +6.2. Mastery has room.
- **Solvability protection changes nothing for a sensible drafter** (90.7 vs 90.8): it is a safety net for the
  unlucky/random path (see the Director audit), not a hidden difficulty knob.
- **Opponent scale remains the most sensitive model parameter** (±2 → ±7 points). Unchanged since V1.5.
- **Season variance is not what makes 114 rare** (no form swing: 0.02% → 0.02%). 114 needs a team whose
  per-match win probability is ~93%+ on every fixture; it depends on construction, not on impossible luck.
- 113 is arithmetically impossible (112 = 37W 1D, then 114); "exceptional" is 112.

No model parameter was changed in V1.6: the measured experience bands already match the design targets
(competent median 91 = "good"; 100+ ≈ 1 season in 7; 110+ ≈ 1 in 300; 114 ≈ 1 in 5,000 for competent play,
5.5% per season for a perfect XI). Changing them would also have required a new engine version for challenge links.

## 5. Draft Director audit (300 competent drafts, 7 formations; rollout values in exact expected points)

| rounds | clear-best (≥3 pts) | close call (≤1.5 pts) | star ≠ best | greedy regret | route offered when one existed |
|---|---|---|---|---|---|
| 1–4 (variety) | 30% (naive 39%) | 42% (35%) | 64% | 3.2 pts | 100% |
| 5–8 (awareness) | 23% (naive 36%) | 51% (40%) | 72% | 4.3 pts | 100% |
| 9–11 (completion) | 31% (naive 43%) | 43% (30%) | 81% | 5.5 pts | 100% |

- The Director makes decisions *less* obvious than a naive draw in every phase, while guaranteeing that whenever a
  complete in-position XI is still reachable, at least one option keeps it reachable (100% of checked offers;
  also asserted in `tests/v16.test.ts` for a random drafter).
- "star ≠ best": the highest-rated option is the best pick in only 19–36% of offers; taking it every round
  (greedy) averages 33 points.
- Final XIs of competent play: 59% with nobody out of position (naive draw: 16%).

## 6. Determinism

Same engine version + seed + ruleset + team → identical season (common random numbers; tested). v2 and v3
links keep their own model and dataset (`MODELS` in `simulation.ts`), so old challenges replay unchanged.
The expectation DP is checked against sampled seasons in `tests/v15.test.ts`.

## 7. Engine v5 (V1.7): identity damping, and what it cost

**Why.** The diversity audit (`docs/diversity-audit.md`) showed that multi-version icons were offered far
more than their squads justify: Cristiano Ronaldo in 18.4% of drafts, Maldini 17.8%, Messi 16.0%, because
each of their PlayerEras was weighted independently. v5 divides each option's draw weight by the number of
versions of that identity (base offer and tailored option). Nothing else moved: same season model
(`eraLeagueV4`), same parameters, same squads.

**Exposure (3,000 drafts):** Cristiano 18.4% → 13.9%, Messi 16.0% → 12.5%, Maldini 17.8% → 13.6%; top 1% of
players 6.4% → 5.3% of all "seen" events; 99.6% of the 2,312 players offered at least once.

**Score distribution (4,000 drafts × 5 seasons per policy, `docs/calibration-v5-report.md`):**

| policy | v4 mean | v5 mean | v4 ≥100 | v5 ≥100 | v4 ≥110 | v5 ≥110 | v5 exact 114 |
|---|---|---|---|---|---|---|---|
| novice | 79.8 | 78.7 | 5.9% | 5.0% | 0.16% | 0.11% | 5.8e-3% |
| competent | 90.6 | 89.9 | 14.4% | 12.8% | 0.34% | 0.32% | 0.01% |
| expert | 89.2 | 88.4 | 11.4% | 9.8% | 0.21% | 0.21% | 8.2e-3% |

Fewer icons means slightly weaker average squads: −0.7 to −1.1 points of mean, competent 100+ from 1 season
in 7 to 1 in 8. That stays inside the v4 target band (competent ≈ 1 in 7–8 at 100+, 114 reachable but
exceptional), so no model parameter was re-tuned — re-tuning would have broken the "v4 and v5 share one
season model" property for no measured gain.

**Decision quality (Director audit, 300 competent drafts):** unchanged within noise. Clear-best offers
29 / 23 / 31% by phase (v4: 30 / 23 / 31%), a positional route offered 100% of the time when one exists,
final XIs with nobody out of position 56% (v4: 59%). Greedy regret rises slightly (3.40 / 4.44 / 5.61 pts vs
3.21 / 4.30 / 5.53): with fewer icons, "take the highest rating" is a little more often the wrong move.

**Links.** v2, v3 and v4 challenges keep their own draw; `identityDamping` applies from engine "5".

## 8. Engine v6 (V1.8): world eras, themed weeks, themed Daily

**What changed.** 20 team eras added (Africa 6, the Americas 9, Asia/Oceania 5: 234 eras, 3,336 PlayerEras,
2,597 players). Themed weeks can guarantee rounds from a featured side (`featured`: AC Milan 2 rounds,
Brazil 4 rounds); from v6 the Daily XI follows the week's theme (the event id travels in the config and in
links). Season model and parameters unchanged. v2–v5 links keep their own dataset (`erasForEngine`) and draw.

**Score distribution (4,000 drafts × 5 seasons per policy, `docs/calibration-v6-report.md`):**

| policy | v5 mean | v6 mean | v5 ≥100 | v6 ≥100 | v5 ≥110 | v6 ≥110 | v6 exact 114 |
|---|---|---|---|---|---|---|---|
| novice | 78.7 | 78.5 | 5.0% | 5.2% | 0.11% | 0.11% | 6.0e-3% |
| competent | 89.9 | 89.4 | 12.8% | 12.0% | 0.32% | 0.29% | 0.01% |
| expert | 88.4 | 88.2 | 9.8% | 9.4% | 0.21% | 0.17% | 6.8e-3% |

The new eras are mostly national squads at levels 77–80: slightly weaker draws on average (−0.5 pts
competent), inside the band. No parameter re-tuned.

**Director (300 competent drafts):** clear-best 32 / 24 / 33% by phase (v5: 29 / 23 / 31), route offered
100% when one exists, 53% of final XIs with nobody out of position (v5: 56%).

**Exposure (3,000 drafts, `docs/diversity-audit.md`):** 99.2% of 2,597 players offered at least once; top 1%
of players 5.4% of "seen" events (v5: 5.3%); all 234 eras drawn.

## 9. Engine v7 (V2.0): 49 new team eras

**What changed.** 49 team eras (35 clubs, 14 national sides, from 1953 to 2016): 283 eras, 4,024 PlayerEras,
3,100 players. Every row passes `src/data/validate.ts` (0 critical errors); every new era has sourced context
(coach, honours) and every new national era a tournament result. Season model and parameters unchanged;
v2–v6 links keep their own pool (`erasForEngine`, gated by `since`).

**Score distribution (4,000 drafts × 5 seasons per policy, `docs/calibration-v7-report.md`):**

| policy | v6 mean | v7 mean | v6 ≥100 | v7 ≥100 | v6 ≥110 | v7 ≥110 | v7 exact 114 |
|---|---|---|---|---|---|---|---|
| novice | 78.5 | 77.6 | 5.2% | 4.2% | 0.11% | 0.10% | 4.4e-3% |
| competent | 89.4 | 88.8 | 12.0% | 11.1% | 0.29% | 0.27% | 0.01% |
| expert | 88.2 | 87.3 | 9.4% | 7.8% | 0.17% | 0.15% | 5.4e-3% |

Most new eras are good-not-legendary sides (levels 80–86): the average draw is slightly weaker (−0.6 pts
competent), still inside the band. The ceiling does not move: the "perfect" reference XI still expects 108.0.
No parameter re-tuned.

**Director (300 competent drafts, `scripts/director-audit.ts`):** clear-best 33 / 27 / 35% by phase (v6: 32 /
24 / 33), route offered 100% when one exists, 52% of final XIs with nobody out of position (v6: 53%).

**Exposure (10,000 drafts, `docs/diversity-audit.md`):** 99.8% of 3,100 players offered at least once; top 1%
of players 5.8% of "seen" events (v6 on the same protocol: 6.1%); 2.3% of players met in a game were already
met in the previous one.
