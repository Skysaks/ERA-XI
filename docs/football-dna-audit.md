# ERA XI — football DNA audit (V1.9)

Principle: football identity comes from behaviour and language (lines, roles, formations, positional
relationships, matchday presentation, season storytelling), not from decoration. **More football must not
mean more UI**: every element below replaced or re-used an existing surface, or lives behind one tap.

Engine rule: everything added in V1.9 is **presentation only** (`src/engine/tactical.ts`). It reads roles,
slots, attributes and the FIT dimensions of the XI the player built; it never changes a rating, FIT or a
result, so no engine version bump and no re-calibration. No chemistry from a shared club or nationality.

## Screen by screen: "could this belong to a basketball or rugby game by changing labels?"

| screen | before V1.9 | V1.9 football-native behaviour | added UI? |
|---|---|---|---|
| Draft — option card | name, positions, role, landing slot, FIT ±n, rating | the one predicted impact that matters: a FIT swing ≥ 4, else what he lifts in the XI (`CREATION ↑`, `WIDTH ↑`; from the role for the first picks) | no (same line) |
| Draft — pitch | fresh-pick ring, out-of-position ring, dashed empty slots | **line completion**: DEFENCE COMPLETE ✓, MIDFIELD SET ✓, FRONT THREE COMPLETE ✓, with the line's players lighting up once; the midfield verdict (MIDFIELD BALANCED / NO BALL WINNER) when it completes; **tactical connections** as they form (CONTROL CORE, LEFT-SIDE OVERLOAD, ELITE DEFENSIVE PAIR, BUILD-UP LINK…); WIDTH RESTORED / DEFENSIVE COVERAGE IMPROVED when a real threshold is crossed (7+ players) | no: the existing tactical chip channel, one moment + at most one impact |
| Team sheet (XI Complete) | stats + generic strengths/weaknesses list | **tactical identity** (style · strength ↑ · weakness ↓), structural players (KEY CREATOR · BALANCE PLAYER · MAIN THREAT), connections drawn as hairlines between the players on the pitch; **YOUR GAME PLAN** (in possession / creation / without the ball / main threat) one tap away | replaced the list; one button shares the row with FORMATION → |
| Season | score, W-D-L, "ERA XI 2–0 Opponent" | fixture lines with the home side first (`BARCELONA · 2011 2–2 ERA XI`), matchday counter, FIRST POINTS DROPPED added to the milestones (max two prominent) | no |
| Result | score, W-D-L, form strip | unchanged (V1.8 form strip) | — |
| Analysis | expected range first, then paragraphs and tables | **WHY 104 PTS?** — WHAT WORKED / WHAT COST YOU POINTS / TURNING POINT ("Round 7 — Busquets instead of Villa · ≈ +2.6 pts · FIT +7"), expectation in one line, then FULL ANALYSIS → | first layer is shorter than before |
| Passport — Draft DNA | percentages (star bias, FIT priority…) | **Football DNA**: an archetype (The Architect, The Counter-puncher, The Wing specialist, The Tactician…), preferred formation, role, era, most frequent identity, six football axes (control ↔ verticality, possession ↔ transition, technical ↔ physical, width ↔ central, star power ↔ team fit, risk ↔ balance). Only after 20 runs, 10 of them with a recorded XI | replaced the bars |

## Friction check

- Draft decision surface unchanged: four options, pitch, club/era, reroll, progress — no scrolling from
  320 × 568 up (mobile audit). The impact line replaced the FIT line, it did not add one.
- One tactical chip at a time, plus the Knowledge line when the setting allows. Nothing blocks a tap;
  the next round is live under both (e2e).
- Moments are gated by the tactical-hints setting like the other pick chips; haptics (if enabled) are a
  double tick for a real improvement only, a short pattern for a personal best / Perfect Era, fired when
  the result is on screen — never during the reveal.

## Language

`Simulate season` → `Play the season` (Jouer la saison / Jugar la temporada); `Team` → `XI` in ratings and
the share card; the XI screen is the team sheet (Ta compo / Tu alineación); tactical terms follow
`docs/glossary.md` (surnombre, bloc médian, pressing haut, charnière…). Plain words were kept where jargon
would be less clear (e.g. "What cost you points").

## Limits (honest)

- **TITLE PACE** is not shown: the Era League has no table (opponents do not play each other), so a title
  race cannot be computed without inventing one.
- Identity and game plan speak relative to a "typical XI" measured on 600 engine-v6 drafts (norms in
  `tactical.ts`); they describe the XI, they do not predict the season.
- The reroll stays in the header (reachable, not in the thumb zone): moving it would change a layout the
  e2e and mobile audits validated; revisit with real-user data.
