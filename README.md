# ERA XI

**Every era. One XI. Prove yours.**

> © 2026 Florian Iglesias — All rights reserved. This repository is public for portfolio purposes only.
> No licence is granted to copy, modify, distribute or use this code or its dataset. See [LICENSE](LICENSE).

A one-minute football drafting game. Eleven club + era draws, one pick per draw, auto-placed into your formation, then a 38-match season (max 114 points). The result becomes a self-verifying challenge link: a friend gets the exact same draws and tries to beat your XI.

**V2.0 at a glance**

- 16 rulesets (Classic, Daily XI, Football IQ, Nations, Era Lock, Champions, Cult XI, Gauntlet, Blitz…), 13 formations
- **Live Duel** (1v1, simultaneous hidden picks, server-authoritative) and **Party rooms** (2–8 players)
- Dataset: 140 teams (93 clubs, 47 nations), 283 eras from the 1950s to 2025, 4,024 player-eras, 3,100 players, with ERA XI's own rating model (no commercial game's ratings are used)
- French, English and Spanish · installable PWA, playable offline · single-file standalone build
- Pure TypeScript engine, deterministic seeded draws and simulation, 211 automated tests, end-to-end and two-browser multiplayer playtests

## Run it

```
npm ci
npm run dev                # http://localhost:3000
npm test                   # unit + integration suite (vitest)
npm run typecheck
npm run lint               # ESLint (typescript-eslint + react-hooks), zero warnings allowed
npm run build              # Next.js production build
npx next start -p 3001 & node e2e/run.mjs   # end-to-end suite against the production build
npm run qa:duel            # two-browser Live Duel playtest (BASE=http://localhost:3001)
npm run validate:data      # dataset validation + quality report
npm run build:standalone   # dist/era-xi.html — the whole game in one self-contained file
```

Requires Node.js 20.9 or later. Optional: `NEXT_PUBLIC_SITE_URL` sets the absolute base for OpenGraph URLs (see `.env.example`).

Browser scripts (`e2e/`, `scripts/playtest-*.mjs`, `scripts/audit-mobile.mjs`, `scripts/perf.mjs`) drive Chromium through `playwright-core`: either run `npx playwright-core install chromium` once, or point `CHROME=/path/to/chrome` at an existing build.

---

## Structure

```
src/
  types/        Domain types (Player, PlayerEra, ClubEra, Formation, DraftState, SeasonResult…)
  data/         Dataset: 93 clubs + 47 nations, 283 eras (1950s → 2025), 4,024 PlayerEras, 3,100 players
    champions.ts        European Cup / Champions League winners table (drives the Champions mode)
    teams.ts            team registry (display names isolated for licensing swaps)
    eras/*.ts           one file per period (pre1980, 1980s, 1990s, 2000s, 2010s, 2020s, nations)
    archetypes.ts       19 role archetypes → attributes; derived rating
    opponents.ts        ERA LEAGUE: 52 iconic sides in 4 tiers
    index.ts            lazy registry (ids eager, PlayerEra parsed per era on first use)
  engine/       Pure TypeScript game logic — NO React, NO Next, NO DOM
    rng.ts              seeded PRNG (cyrb128 → sfc32), sub-streams, seeds
    positions.ts        position familiarity tiers (natural / secondary / twin / near / adjacent / …)
    formation.ts        13 formations with pitch coordinates + validation
    ratings.ts          slot assessment (player × slot → rating, out-of-position flag)
    fit.ts              tactical profile (10 dimensions), FIT score, role overlap, pick impacts, observations
    autoPlacement.ts    Hungarian assignment with stickiness + natural-position bias
    draftGeneration.ts  seed → 11 offers + 1 reserve offer (for the single reroll)
    draft.ts            draft session: pick, reroll, swap, preview, replay
    simulation.ts       Poisson season model, pluggable per engine version
    season.ts           complete draft → season
    challengeProtocol.ts  payload schema (zod/mini), encode/decode, replay-verification
    compare.ts          rival comparison with per-round counterfactual replays
    analysis.ts         executive summary for the Analysis sheet
    weights.ts          what each position asks of a player (shared by data + engine)
    rulesets.ts         Ruleset Engine: every mode is a validated GameRuleset (config, not code paths)
    modes.ts, daily.ts, version.ts
  game/
    machine.ts    explicit state machine (HOME, CHALLENGE_INTRO, DRAFTING, XI_COMPLETE, SIMULATING, RESULT, CHALLENGE_RESULT)
    storage.ts    localStorage profile (records, per-mode bests, daily official attempt, passport, challenge history)
  multiplayer/  Rooms — framework-free, transport-agnostic
    roomEngine.ts       authoritative pure reducer (applyIntent), redacted snapshots, verified scores
    server.ts           RoomServer (create/join/intent/poll/results/sweep) — wrapped by the API routes
    protocol.ts         zod/mini wire schemas (requests, intents, snapshots), nickname sanitising
    transport.ts        RoomTransport interface
    httpTransport.ts    web: polling against /api/rooms (validated both ways)
    presenceTransport.ts  artifact: peer presence + SHA-256 commit–reveal, no server
    memoryTransport.ts  in-process (tests, practice vs bot)
    client.ts           RoomClient: optimistic lock, reveal window, roomView() projection
    results.ts          duelOutcome (points → head-to-head tie-break → pick comparison), party standings
    bot.ts, hash.ts
  server/rooms.ts  process singleton, rate limits and body-size cap for the API routes
  stats/pickStats.ts  pick-statistics structures + local event queue (nothing displayed yet)
  i18n/         en.ts (source keys) · fr.ts · es.ts (typed: a missing key fails the build) · react.tsx provider
  components/   React UI (GameApp orchestrates; one component per screen + Pitch, ShareSheet, ui; DuelApp = rooms)
  utils/        analytics (provider-agnostic), share card (canvas)
  app/          Next.js routes: /, /c/[token] (+ OpenGraph image), /r/[code] (room link), /api/rooms, /api/rooms/[code]
  standalone.tsx  single-file build entry
tests/          15 suites, 211 tests (engine, data integrity, i18n, multiplayer, API hardening, one suite per release)
scripts/        calibration, Playwright playtests, standalone build
```

## Architecture decisions

1. **The engine is a pure library.** Everything that decides outcomes lives in `src/engine` and imports only `src/data`, `src/types` and `zod/mini`. It can be dropped into an Expo app unchanged. React never computes game logic; it renders engine output.

2. **The draw is fixed by the seed, independent of choices.** `generateDraw(seed)` produces all 11 offers plus one reserve offer up front. The reroll swaps the current round for that reserve. Consequences: a challenger gets exactly the same opportunities whatever they pick; no player ever appears twice in a draw, so duplicate picks are impossible by construction; replays are trivial.

3. **Common random numbers in the simulation.** League fixtures, opponent strength and match "luck" come from `seed + engineVersion` only; the XI changes only the Poisson rates. Goals are drawn by inverse CDF, so on the same seed a stronger team never draws fewer goals (tested). Head-to-head challenges therefore measure decisions, not dice.

4. **Challenges are self-verifying, server-free URLs.** The payload (`v, e, s, m, f, sc, p, r, l, n?, d?`) is base64url JSON: seed, mode, formation, the option index per round, reroll round, the final layout (slot → round) and the claimed score. On open it is (1) size- and charset-checked, (2) schema-validated with zod (strict: unknown keys rejected), (3) engine-version-checked, (4) replayed, and (5) the replayed score must equal the claimed score. A hand-edited score is rejected. Names are restricted to 16 letters/digits/space/`.'_-`. No other personal data.

5. **Engine versioning.** `ENGINE_VERSION` covers data + generation + ratings + simulation. Old links are rejected with a clear message instead of silently producing a different game. `simulateSeason` dispatches to a model registry keyed by version, so a v2 model can ship alongside v1.

6. **Explicit state machine.** One discriminated union + pure reducer (`game/machine.ts`). Seeds and timestamps enter through actions, so the reducer is deterministic. The season is computed synchronously on `SIMULATE`; the 3.2 s reveal is presentation only and `SKIP` jumps straight to the result.

7. **Modes are data.** `MODES` carry `showRatings`, `rerolls` and draw rules (`pool`, `eraLock`); `MODE_CATALOG` lists live, entry-point and planned modes. Components read flags, not mode ids. In IQ mode options are ordered by line so their order leaks nothing about ratings.

8. **Auto-placement** re-solves the whole assignment (Hungarian, 11×11) on each pick, with a stickiness bonus (players only move when it's clearly better) and a small natural-position bias. Manual swaps are allowed on the complete XI (tap two players).

9. **FIT** = 100 − penalties: tactical dimensions below balance thresholds (width, finishing, creation, progression, control, defence, ball-winning, pace, aerial, build-up), unfamiliar positions, and role overlap in midfield/attack. The live FIT meter and the per-pick impact chips (`CREATION ↑`, `OUT OF POSITION ↓`) come from the same model.

10. **No network during play.** Data is bundled; fonts are self-hosted (Barlow Condensed + Inter, latin + latin-ext). The `/c/[token]` page is server-rendered only for OpenGraph metadata; gameplay is entirely client-side.

11. **Analytics** are typed events (`landing_view` … `share_clicked`, full list in `src/utils/analytics.ts`) behind `setAnalyticsSink()`. Default sink buffers in memory and logs in dev. Plug any provider without touching components.

12. **Security.** The room API never trusts a request: bodies are size-capped (4 KB) and schema-validated (zod, strict), scores are recomputed server-side from the picks, an opponent's picks stay hidden until both have locked, seat tokens travel in a header, and every endpoint is rate-limited per address. Production responses carry a strict Content-Security-Policy (same-origin only), HSTS, `nosniff`, `frame-ancestors 'none'` and a restrictive Permissions-Policy. No third-party scripts, fonts or trackers are loaded.

## Known limitations

- **Dataset is editorial, and the expansion half is less verified** (see `ratingConfidence`). The 122 eras added in V1.3 were authored from football knowledge with a validator (structure, positions, levels, namesakes) and only partial source checks (some finals line-ups and federation squad lists). Expect a few wrong squad members or debatable levels, especially pre-1980. `data-authoring/GUIDE.md` + `scripts/validate-data.ts` are the correction workflow. 4,024 PlayerEras with judgement-based levels; attributes come from 19 archetype templates plus per-player traits. Credible enough for real dilemmas, not a statistics product. Pre-1980 ratings carry `ratingConfidence: low`. Some classic squads have only 11–12 players (listed in `docs/data-quality.md`).
- **V2.0 eras were authored with AI assistance and spot-checked, not line-by-line verified.** Two older identity merges are known and kept so v5/v6 draws do not change: `danilo` (São Paulo 2005 attacking midfielder merged with the Juventus/Santos right-back) and `perea` (Colombia 1994 merged with Atlético 2008). Coverage is Europe-heavy: 77% of PlayerEras by team country (South America 14%, Africa 4.5%, Asia/Oceania 2.7%, North/Central America 2.0%).
- **Keeper trap.** A draft can end without a goalkeeper if every keeper offered is skipped; it is heavily punished (by design) and flagged three ways, but it remains the most common cause of very low scores in bot testing.
- **Real team and player names** are used as plain text (opponents included). Names are isolated in `teams.ts` / `opponents.ts` for a licensing pass; no crests or photos.
- **Picks are inside the challenge link.** They're not displayed before completion, but a technical user can decode the base64. Hiding them properly needs a server (store the run, link by id).
- **Rivalry records are local** (per browser, keyed by the display name). No accounts, no cross-device history. The storage shape is versioned so it can sync server-side later.
- **No percentiles** are shown — there is no comparative data yet (by design, no fake numbers).
- **Daily XI** uses the UTC date; "ranked" is only the first local attempt (easy to bypass by clearing storage). Real ranking needs a server.
- **Standalone build** (`dist/era-xi.html`): links use `#<token>`; in sandboxed embeds Web Share and file downloads are blocked, so the image is saved by long-press/right-click and the challenge is shared by copying the link.
- OpenGraph image uses the default font (no custom font loaded server-side).
- Club names are used as plain text only (no crests, photos or official assets). Real player names are used; for a public launch, check image/name rights per market.
- **Rooms on the web** live in one Node process's memory: a restart or a multi-instance deploy loses rooms. Polling (600 ms) is fine for 2–8 players, not for thousands of rooms.
- **Presence rooms (artifact) are trust-light.** Commit–reveal stops peeking, not cheating by a modified client (a peer can refuse to reveal, i.e. stall). Ranked duels must go through the server. Only signed-in viewers the platform admits can join; public-link visitors get practice mode.
- **Disconnect in a duel**: after 60 s the opponent shows as "left"; the remaining player can finish the draw solo as practice. There is no forfeit win (no result is invented).
- **Party rooms** have no kick, no lock after start, no spectators (the host role migrates for the rematch since V2.0).
- **Shared Draft comparison** reuses the duel's "your pick vs theirs" counterfactual, even though the second picker could not take the first picker's player that round.
- **Blitz timer** runs on the client; a paused tab pauses nothing (it keeps counting on return). No server-side timing yet.
- **Server metadata** (page titles, OpenGraph image) stays in English; only the app is localized.
- Duel results skip the 38-match reveal animation (both players land on the result together).
- E2E (`e2e/run.mjs`) and the mobile audit run locally against a production build with the bundled Chromium; CI (GitHub Actions) runs typecheck, lint, unit tests, the build and a dependency audit, not the browser suites. Real iOS Safari was not available: iOS behaviour (dvh, safe areas, standalone PWA) is covered by CSS assumptions and Chromium mobile emulation only.
- **Android back / iOS swipe-back inside a sheet** closes the screen state the app tracks, not the sheet itself (sheets don't push history entries). Escape / backdrop / ✕ close them.
- **V1.4 — not built, by necessity:** "Left foot only" needs footedness per player, which the dataset does not have ("One player per nation" became possible with V1.7 nationality data). Push notifications need a push backend + VAPID keys. Accounts, cloud sync, leaderboards and ERA+ billing are architecture only. Pick popularity needs a backend aggregating real picks. Analytics events stay in memory until a sink is configured; wire consent as opt-in before adding a remote sink in the EU.
- **Resume is one slot** per device: starting a new solo draft replaces the saved one once its first pick is made.
- **Artifact build** has no service worker/install (the platform serves the page); everything else in V1.4 works there.
- **V1.5 — offers from round 5 can differ between two players on the same seed.** The Draft Director tailors one option to each XI, from the same squad. Rounds 1–4, the clubs/eras of every round and at least three options per round stay identical. Daily XI and challenges remain fair: same function, same squads. But "same 11 draws" now means same squads plus mostly the same options. Rooms keep strictly identical offers.
- **Roles.** 19 role tags drive FIT. Regista and inverted full-back are Role School entries, not separate tags: DLP covers the regista profile, and inverted full-backs would need per-player editorial tagging of 3,017 player-eras.
- **One Nation** as a mode is not built (nationality now exists for every player; it drives the Italy theme and the Passport).
- **V1.7/V1.8 limits:** "Left foot only" needs footedness data (not built); coverage is still Europe-heavy (≈ 76% of PlayerEras; Africa 10 eras, Asia/Oceania 7, North/Central America 5); historical notes are limited to sourced structured facts (no free text); inverted full-back exists in Role School but is not a player tag.
- **Calibration is against synthetic drafters**, not real players. The v4 targets (competent ≈ 1 in 7 seasons at 100+) should be re-checked against real run data once analytics has a sink.
- **Expected ranges and turning-point impacts are model estimates** (exact expectation of the season model on the seed's fixtures), labelled as such.

## Documentation

- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — what each version (V1.1 → V2.0) changed and why
- [`CALIBRATION.md`](CALIBRATION.md) and `docs/calibration-*.md` — season-model calibration
- [`docs/multiplayer-audit.md`](docs/multiplayer-audit.md) and [`MULTIPLAYER_QA.md`](MULTIPLAYER_QA.md) — Live Duel audit and manual QA script
- [`docs/data-quality.md`](docs/data-quality.md), [`docs/diversity-audit.md`](docs/diversity-audit.md) — dataset coverage and draw diversity
- [`docs/glossary.md`](docs/glossary.md) — roles, positions and terms

## Legal

© 2026 Florian Iglesias. All rights reserved — see [LICENSE](LICENSE). Contributions are not accepted ([CONTRIBUTING.md](CONTRIBUTING.md)); security reports go through [SECURITY.md](SECURITY.md).

ERA XI is an independent fan project. It is not affiliated with, endorsed by or sponsored by any club, national federation, league, FIFA, UEFA or player. Club, competition and player names are used descriptively as historical facts; they remain the property of their respective owners. No crests, kits, logos or photographs are used.
