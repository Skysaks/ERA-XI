# ERA XI — Changelog

Release-by-release notes moved out of the README. Newest last.

## V1.1 — depth & replayability

| Area | What changed |
|---|---|
| Universe | 92 eras from Real Madrid 1956 to Liverpool 2025, 1,142 PlayerEras. Same player = several PlayerEras (Messi ×5: Barça 08–12 **99**, 14–18 97, 18–21 96, PSG 92, Argentina 22 94). Registry parses eras lazily, so the dataset can grow to thousands of rows without start-up cost. Nations are authored but kept out of the club pool (for the Nations mode). |
| Ratings | Displayed rating is derived: authored era level + half-weight of how the player's own traits score against his natural position's demands. Slot ratings are centred on it (natural slot = displayed rating), so previews like `→ LW −6` are exact. Tests pin all-time greats to 95–99 at their peak and above their own other eras. |
| Era League | Seasons are played against 19 of 52 iconic sides (Milan 1989, Barcelona 2011, Brazil 1970…), stratified 3 giants / 5 elite / 6 strong / 5 dangerous so every seed is equally hard; home and away. Names are data only. |
| Reveal | Same ~3.2 s. Adds the live fixture (`MD 24 · ERA XI 3–1 Milan 1989 · H`) and up to six story beats (first defeat, statement win, five-goal night, 8 wins in a row, unbeaten 10/20/30, Invincibles), all derived from the pre-computed results. |
| Scoring clarity | `83 PTS / 114` for the first two results (and on every challenge intro/card); `83 / 114` after. |
| Pre-pick consequences | Each option shows where auto-placement would put him, the rating change there (`→ LW −6`), the FIT change (`FIT +3`) and "Out of position". Still one tap. |
| Modes | Mode = config object (`showRatings`, `rerolls`, draw rules). Live: Classic, Football IQ, **Era Lock** (all 12 draws from one seeded period), **No Reroll**; entry points Daily XI and Rival. Catalogued as "Soon": Nations, One Club, Champions, Position Draft, Gauntlet, Mystery XI. Home keeps Classic/IQ one tap away; the rest sit behind "More modes". |
| Daily XI | One seed per UTC date. First completion is stored as the official attempt with its verifiable challenge token (backend-ready); later runs are casual and never overwrite it. No rankings or percentiles shown. |
| Records | Best points, games, best ATT/MID/DEF/FIT, best per mode (Home → "Best … ›"). Result shows `NEW PERSONAL BEST` or `Personal best 91 — 8 pts away`. |
| Analysis | Executive summary first (strongest 2–3, weakest 1–2, positional problems, a computed one-paragraph explanation), then collapsible full tactical profile and all 38 fixtures. |
| Rival comparison | For each round where the picks differ and both saw the same offer, the engine replays *your* draft with *their* pick and simulates it: `ATT +4 · DEF −5 · FIT −2 · +3 PTS`. The biggest swing is shown as the decisive pick and printed on the shared result card. |
| Passport data | Player-eras seen/drafted, players, clubs, eras logged locally for a future Era Passport. No currency, XP or packs. |

Engine version is now **2** (data and simulation changed); v1 challenge links are rejected with a clear message.

## Calibration (engine v2)

Measured with `node scripts/run-ts.mjs scripts/calibrate.ts` over 300 drafts per strategy, 4-3-3:

| Strategy | Avg pts | p10 | p90 | Max |
|---|---|---|---|---|
| Random picks | ~44 | 17 | 73 | ~95 |
| Always highest rating (ignores positions) | ~37 | 14 | 68 | ~100 |
| Rating + stays in position | ~77 | 50 | 97 | ~110 |
| Greedy on team rating × FIT | ~89 | 77 | 100 | ~108 |

Era Lock and No Reroll land within ±2 pts of Classic for the same strategy. Strong XIs score ≈ 2.6 per game and concede ≈ 0.8. Two random drafts share ~13 % of their club-eras and ~5 % of their player-eras; ~59 % of offers have two options within 3 rating points of the best, and every offer spans at least 3 different positions.

`scripts/audit.ts` prints these numbers plus multi-era calibration; `scripts/audit-runs.mjs` plays six full runs in the browser across formations and modes.

## Product review after first playtest (what changed)

- Flow: **14 taps home → result** (Play, 11 picks, Simulate, Skip — Skip optional). No confirmations, no Next buttons, no loading between rounds.
- Draft pitch initially collapsed to 0 px (positioning bug) — fixed.
- Bots finishing without a keeper scored ~40: added a volt `→ GK` chip when the goal is empty, an earlier "No keeper yet" warning, and a "No real goalkeeper" observation on the XI screen.
- First simulation calibration gave ~4.5 goals/game — retuned to realistic scorelines.
- Result screen: score wrapped on desktop and tokens overlapped on mobile — fixed.
- Rival screen: Rematch was below the fold on mobile — now a sticky action bar.
- Double-tap guard (220 ms) so a fast second tap can't pick in the next round.
- `prefers-reduced-motion`: fly-to-pitch animation and reveal are skipped.

## V1.2 — modes, multiplayer, platform

**Ruleset Engine** (`engine/rulesets.ts`). A mode is data: `playerPool, eraFilter, clubFilter, nationFilter, ratingsVisible, formations, rerolls, choiceCount, pickTimer, sameSeed, sharedPool, multiplayerType, seasonType, ranked` (+ `roundSync`, `maxPlayers`, `status`). `validateRuleset` rejects contradictions (a shared pool in solo, rerolls in multiplayer, a duel without lockstep rounds, ranked play without a shared seed, wrong player counts). Live: Classic, Football IQ, Daily XI, Era Lock, No Reroll, Live Duel, Party. Prepared (validated, flagged "Soon"): Nations, One Club, Blitz, Cult XI, Shared Draft, Gauntlet, Mystery XI, Champions, Position. Features a ruleset needs but the engine doesn't implement yet (`pickTimer`, `sharedPool`, gauntlet seasons) are listed in `IMPLEMENTED_FEATURES`, so a prepared ruleset cannot be switched live by accident. Daily XI is now its own ruleset (before: today's seed played in the player's default mode — Era Lock players got a different draw).

**Live Duel.** Create → code + link → the friend opens the link, optional name, PLAY (3 steps). Same seed, offers, formation. Both pick at once; a pick is locked on tap; the opponent only learns it when both have locked (server: redacted snapshot; artifact: commitment hash). Reveal ≈1.3 s ("YOU → MODRIĆ / ANTHONY → BENZEMA"), no Continue button. Same player for both is allowed. States: waiting, choosing, opponentReady, locked, reveal, reconnecting, disconnected, completed. A reload re-enters the room with the same seat (token/seat kept per tab). Result: season points decide; the XI-vs-XI match (neutral, penalties if level) is shown for fun and only breaks a tie; 2–4 pick differences with ATT/MID/DEF/FIT/points impact (counterfactual replay). Rematch = both vote → new deterministic seed in the same room.

**Party rooms.** 2–8 players, same draft, free pace (nobody waits), progress/connection per player, table from verified scores, host "Run it back" (new seed, everybody straight into round 1).

**Authority.** The server owns seed, ruleset, round, locked picks, timing and validation. Clients send only intents (`lock {round, optionIndex}`, `rematch`, `leave`, `rename`); scores are never accepted — `RoomServer.results()` replays `(engineVersion, seed, ruleset, picks)`. Prototype storage is in-process memory (one Node instance, 3 h TTL); swapping it for Redis / Durable Objects touches only `server.ts`.

**Transports.** Web: `HttpTransport` (600 ms polling). Artifact: `PresenceTransport` over the `room` capability (each player publishes commitments; reveals only after every active opponent committed; forged reveals are ignored). No room capability, or a signed-out/public-link viewer: "Practice vs bot" (in-page RoomServer + house bot, avg ≈72 pts, below a careful human's ≈80–89).

**Career** (local): games, average season (exact over counted seasons), best score and ratings, bests per mode, Daily official history, Duel W/L, Party wins, discovered player-eras/clubs/eras. No XP, currencies or streak mechanics.

**Pick statistics**: `PickEvent` → `aggregateOffer` (pick rate, avg final points, duel win rate, FIT impact, popular/contrarian) with `MIN_SAMPLE = 30` and `visibleStat()` that returns nothing before the player's own decision. Events are queued locally; nothing is displayed because one device is not a crowd.

Playtests: `scripts/playtest-duel.mjs` (2 browsers over HTTP incl. network drop + rematch), `playtest-party.mjs` (3 browsers + practice), `playtest-presence.mjs` (standalone build + fake presence channel, reload mid-duel, no-capability fallback).

## V1.3 — every mode, more football, three languages

**Modes (all live).** Nations (50 national sides), One Club (9 clubs with ≥5 eras and ≥54 distinct players; pick the club or random; no reroll), Blitz (8 s per pick; on timeout a seeded option is picked, so challenges replay it), Cult XI (nobody above 86), Shared Draft (live 1v1, one pool, first pick alternates each round, the taken player is struck out; server and presence both enforce turns), Gauntlet (knockout vs 10 legendary XIs weakest → strongest, penalties on a draw, score = legends beaten /10, kept out of league records), Mystery XI (club/era/ratings hidden until the pick, then revealed), Champions (only European Cup / Champions League winning squads — 48 eras, from a winners table, not hand tags), Position Draft (each round names the slot; offers only contain players who can play it; 2–4 options; the pick goes straight there). Era Lock now lets the player choose the period.

**Dataset versioning.** Engine v3 = V1.2's league model on the V1.3 dataset. Eras carry `since`; engine v2 challenge links still replay on exactly the V1.2 pool (tested with real V1.2 tokens). Old links never break while their version is listed in `SUPPORTED_ENGINE_VERSIONS`.

**Navigation.** A home button on every screen (draft, XI, simulation, result, challenge, rooms). It asks for confirmation only when an unfinished run or a live game would be lost.

**Languages.** FR / EN / ES switch on Home, persisted; default = browser language. Everything is translated, including engine-generated text (analysis, observations, pick comparisons, season events are produced as message keys, not English strings), share texts, the share card and position codes (FR: GB/DC/DG…, ES: POR/DFC/LI…).

Calibration (greedy drafter, 60 seeds): Classic v3 avg 83 (v2: 87 — the larger pool includes more non-elite sides), Champions 90, One Club 88, Era Lock 87, Position 81, Cult 67, Gauntlet 4/10. House bot ≈72.

## V1.4 — polish, retention, PWA, free-to-play architecture

The loop is unchanged (OPEN → PLAY → 11 decisions → see why → try to beat it → challenge). Everything below sits around it.

- **Home from anywhere, no loss.** Solo runs are autosaved after every decision (`game/resume.ts`: seed + choices + reroll + manual layout, replayed deterministically). Home, browser Back and closing the tab all keep the run; Home shows `RESUME DRAFT · 6 / 11 · Classic · 4-3-3` (× discards). No confirmation in solo. Live rooms keep one confirmation, and browser Back in a room triggers that same confirmation. Daily XI resumes today's unfinished attempt instead of restarting it.
- **Quick Play.** PLAY launches the remembered mode + formation (+ era/club/league choice) in one tap; the chips stay optional.
- **Mode discovery.** Home = PLAY / DAILY XI / DUEL / MODES. The Modes sheet: "This week" event on top, then CORE / SOCIAL / HISTORY / SKILL / ADVANCED (`MODE_GROUPS`, presentation over rulesets). New rulesets: **One League** (ENG/ESP/FRA/GER/ITA club football across eras) and **Weekly Event**.
- **Weekly events** (`engine/events.ts`): draw-rule overrides on the classic ruleset, ISO-week rotation (Mon–Sun, UTC) + explicit dated schedule, localized names. Live: The 2000s, South America, No Ballon d'Or (41 winners excluded), Champions Only, English Football, Before 1990. Shown as "Until Sunday 27 September" — no countdown. Weekly challenge links carry the event (`w`).
- **Play again / Run it back.** Result offers both. Run it back = same seed, new decisions; for Daily it is labelled PRACTICE and never overwrites the official attempt (first completed attempt = official).
- **Why this score.** Under the score: one deterministic strength and one weakness from the tactical dimensions ("ELITE CREATION", "BUILD-UP WAS YOUR MAIN WEAKNESS"; FIT < 60 overrides with "POOR FIT: N OUT OF POSITION"). Tap → analysis, which now lists the 2–3 decisions **worth reconsidering** (Draft Lab counterfactual: one pick swapped, everything else equal, positive swings only) with a Run it back button. Post-game only.
- **Records & FORM.** Best, average, recent scores, best by mode, best ATT/MID/DEF/GK/FIT, 100+ seasons, unbeaten seasons, Duel W/L, personal-best lines. FORM = active days over the last 7 (● ● ● ○ ● ● ○ 5/7); a streak function exists but is not displayed.
- **Achievements** (8, rare, one quiet line on the result, listed in the Passport): Centurion, Almost Perfect, Perfection, Invincible, Purist, No Second Chance, Legend Hunter, Cult Classic.
- **Era Passport**: players discovered /2,300, player seasons /3,017, historic teams /214, clubs /78, nations /31, eras /6, achievements, Draft DNA (locked until 20 games; measured, never assigned).
- **Draft DNA data** (`game/dna.ts`): star bias, FIT priority, attack/defence/creator share, eras, clubs, roles, reroll use, out-of-position risk per run. `contrarianRate` stays null until crowd data exists.
- **Pick statistics** (`stats/pickStats.ts`): every pick is queued locally with the fields a backend needs (pick rate, final score after pick, FIT impact, duel result, contrarian rate). The shipped provider returns nothing, so no percentage is ever shown; the UI hook shows "18% made the same pick" only after the pick and only with real data.
- **Settings** (gear on Home; GAME open, EXPERIENCE and ACCOUNT & PRIVACY collapsed): default formation/mode, season Live/Fast/Instant, impact hints, placement preview, post-pick stats, resume; language, sound (off by default, WebAudio, no files), haptics, motion System/Full/Reduced, high contrast, larger text, install; guest status, account/sync/public profile/leaderboards (disabled, need accounts), analytics consent, notification preferences, export (clipboard) and delete. Official Daily attempts, received challenges and rooms pin hints + preview on.
- **PWA**: manifest (standalone, maskable icon), service worker (shell precache, network-first navigation with offline fallback to the cached app, cache-first static assets, rooms/API online-only), `offline.html`. Verified on a production build: full solo season offline and `/c/<token>` challenge links offline. Install suggestion only after 3 completed games, once, never after dismissal; iOS gets 3-line Safari instructions; Settings always has the entry.
- **Free-to-play architecture** (`platform/`): ERA+ entitlements (analytics, history, Draft Lab, reports, Daily archive, custom rulesets, private rooms+, rival analytics, premium cards, profile, ad-free) with a `FORBIDDEN` list (boosts, multipliers, packs, energy, paid rerolls). `canPlayReceivedChallenge` always returns true; a challenge flagged `x` shows "This challenge used ERA+ custom rules. Create your own →" after completion. Sponsor slots exist only for home / daily / result (no slot id can target the draft, picks, pre-simulation or rerolls); none configured. Notifications: preferences only, never asked on first visit (`PUSH_AVAILABLE = false`). Accounts: guest-first, anonymous local guest id; auth providers not wired.
- **Social extension points** (`multiplayer/extensions.ts`): types for 2v2 Team XI, Co-op XI, Creator Rooms, Spectator; Live Duel untouched.
- **Analytics** added: time_to_first_play, first_game_completion, second_game_start, session_runs, run_it_back, personal_best_replay, daily_return, resume_draft, challenge_send, duel_start/completion, install_prompt_seen/dismissed, pwa_installed, account_conversion, eraplus_paywall_view/conversion, settings_changed. No names, emails or contacts; off switch clears the buffer.
- **Accessibility**: motion setting on top of prefers-reduced-motion, high-contrast tokens, larger-text mode, focus rings, tap-to-swap (no drag-only path), symbols + text next to every colour signal (▲/▼, ◆/◇, dots + count).

Tests: 126 (22 new in `tests/v14.test.ts`). Playtests: `playtest-v14.mjs` (new / returning / resume / Back / daily official→practice / run it back / modes / settings / passport / friend receiving a challenge in French), `playtest-pwa.mjs` (production build, offline), plus all earlier scripts.

## V1.5 — game depth, player agency, calibration (engine v4)

Measured first, then changed: see **CALIBRATION.md** (100,000-season reports for v3 and v4, factor-by-factor diagnosis).

- **Engine v4.** Director-built offers, FIT v2, the v4 season model. v2/v3 challenge links keep their own draw, ratings and model and replay unchanged (tested).
- **Draft Director** (`engine/director.ts`). Clubs and eras stay random and shared. Base offers are structured: a superstar, different jobs, a versatile wildcard; ≥ 2 positions per offer (100% of 720 test drafts had ≥ 3). Rounds 1–4 are identical for everyone. From round 5 one option may be tailored from the same squad: a player for a slot few later squads can fill (need), else the squad member who most lifts this XI's FIT. Rounds 9–11 are protected: if none of the shared options keeps a complete in-position route open, the tailored one does. Offers depend on the drafted *set*, not its arrangement, so challenges replay exactly. Rooms use `shared` (identical offers for every seat); `naive` and `protectSolvability: false` exist for Hardcore-style rulesets.
- **Solvability evaluator** (`solvability()`): bipartite matching of the eleven slots against the drafted players plus the remaining rounds (their squads), with per-slot scarcity. A careful player never ends with a forced out-of-position player (0 of 720 drafts over 6 modes), and the Director never fails to offer a route from a solvable state. Dev diagnostics: `localStorage["eraxi:debug"]="1"` in development shows the route and scarcity on the draft pitch.
- **Positioning.** One-tap auto-placement is unchanged. Tap any drafted player, during the draft or on XI Complete, and the pitch shows his rating at every slot he can reasonably play (`DM 94`, red ⚠ when out of position); tap a slot to move or swap. Other slots stay possible, with the penalty shown. Position Draft keeps its fixed slots.
- **13 formations** (4-3-3, 4-2-3-1, 4-4-2, 4-3-1-2, 4-1-2-1-2, 4-3-2-1, 4-2-4, 4-2-2-2, 3-4-3, 3-4-2-1, 3-5-2, 5-3-2, 5-2-3). Home keeps 4 recent ones up front, and "+9" opens the rest. On XI Complete the formation tag opens a sheet: every shape with the XI re-arranged at its best, projected FIT and expected points. Rulesets declare `formationPolicy: flexible | locked`; Position Draft and rooms are locked. A post-draft formation travels in challenge links (`g`).
- **Rating model, separated and shown.** Base ability (era level + attribute profile), rating by position (`positionRatings`: natural / secondary / close, with the penalty), role suitability, and team impact (FIT). Player inspection is optional: an **i** on each option, or **Details** when a player is selected. It shows ratings by position, attributes, and "Era level 88, +0 for how his attributes fit what a CB needs → 88", labelled as model estimates. Ratings stay hidden in Football IQ / Mystery.
- **FIT v2** (`roleSynergies`): eleven named, bounded role rules. Width without overlap, transition exposure, crosses for a target man, slow centre-backs behind an aggressive team, build-up from a ball-playing CB to a deep progressor, strike partnerships and clashes, false nine + inside forwards, no ball-winner. FIT is itemised to the point (`explainFit`; tap the stats on XI Complete). A new relationship also shows as a pick impact.
- **XI check + OPTIMISE XI.** Flags severe structural problems before the season: no natural keeper, 2+ out of position, a critical dimension, transition exposure. OPTIMISE XI tries every allowed formation and arrangement, ranked by expected points. It shows FIT and points before → after, applies only on tap, and can be undone.
- **Season model v4** (`eraLeagueV4`) + **expectation model** (`expectedSeason`: exact points distribution, expected, 80% range, tails). Analysis opens with WHY THIS RESULT: expected range vs result, then outperformed / as expected / below.
- **Analysis.** "ANALYSE MY XI →" button under the verdict. Order: why this result → explanation → FIT itemised → **turning points** (the 1–3 picks whose best shown alternative would have moved the expected season most, with FIT/ATT/dimension deltas and "≈ +2.6 pts (estimate)") → **REPLAY FROM ROUND n**. That is a practice run on the same draft: labelled PRACTICE and never recorded, so it can't replace a best score or a Daily. Challenge comparisons use the same estimates.
- **Modes.** Home: `MODES →` with "Nations · Eras · Clubs · Skill". Browser groups: CORE (Classic, Football IQ, Daily), IDENTITY (**Nations**, World XI, One Club, One League), HISTORY (Era Lock, Champions, Cult XI, Gauntlet), SKILL (Blitz, No Reroll, Position Draft, Mystery), SOCIAL (Challenge, Live Duel, Party, Shared Draft). **World XI** is new: eleven different national teams (`maxSameTeam: 1`).

Tests: 146 (20 in `tests/v15.test.ts`). Playtests: `scripts/playtest-v15.mjs`, plus every earlier script, re-run.

## V1.6 — pre-launch pass: fairness, calibration, mobile, robustness

Engine v4 unchanged (no model parameter moved: measurements matched the targets), so every existing link replays identically.

- **Measured, then decided.** 100,000-season calibration re-run with 111+/112+/113 columns and W/D/L + goals per group; v4 per-factor diagnosis (`scripts/calibration-v4-diagnose.ts`); Draft Director audit with rollout values (`scripts/director-audit.ts`). Results and reading in **CALIBRATION.md** §3–5.
- **Suspense preserved.** No points prediction before the season anywhere in the main flow: the formation sheet shows FIT, out-of-position count and a "best" tag; OPTIMISE XI shows FIT / out of position / overall before → after. Expected points stay internal (ranking) and appear only in Analysis after the season.
- **FORMATION →** action on XI Complete names a clearly better shape when there is one (`4-3-3 · FIT 91 ↑`). Projections are computed after first paint, one formation per task (`formationProjection`), so a phone never janks (no long task measured at 4× CPU slowdown).
- **Result hierarchy:** score → why → CHALLENGE → Play again / Run it back → ANALYSE MY XI → → ratings → XI. Challenge is on screen without scrolling from 320×568 up.
- **Mobile pass** (`scripts/audit-mobile.mjs`: 14 screens × 7 viewports incl. landscape, measured): every tap target ≥ 44 px, no text < 11 px, no horizontal overflow, primary CTA in the first viewport everywhere. Short-screen (`short:`) and landscape-phone (`flat:`) variants: compact Home hero, two-column draft/XI/result in landscape, sticky SIMULATE on XI Complete, fluid score sizes ("104 PTS / 114" fits 320 px). The player selection bar no longer covers pitch slots. The most severe XI-check item replaces the swap hint so it is visible without scrolling. Double-tap guard: a second tap within 250 ms can't pick in the next round.
- **First run:** one line of micro-guidance on rounds 1–3 (overlaid on the pitch, no layout cost), then nothing.
- **Inspection** shows Physical too.
- **Performance** (`scripts/perf.mjs`, 4× CPU): Analysis, Duel/rooms, Settings and Passport are lazy chunks prefetched when idle (and handed to the service worker, so they work offline — asserted in `playtest-pwa.mjs`); main app chunk 156 → 110 KB gzip. First paint waits ≤ 800 ms for the display fonts: CLS on Home 0.156 → 0.023.
- **Reliability:** error boundary with a way back to the menu (and a saved draft that crashes Home is dropped); an unreadable or newer-schema profile is kept aside (`eraxi:v1:unreadable`) instead of being overwritten; `app_error` analytics event.
- **Quality gates:** ESLint added (`npm run lint`, 0 warnings). 160 unit tests (14 in `tests/v16.test.ts`: route guarantee under a random drafter, early variety, greedy vs competent gap, incremental projections, locked formations, manual swap, position ratings, calibration band, sampled 114 attainability, 113 impossible, every solo ruleset completes, persistence safety, i18n). `e2e/run.mjs`: 21 end-to-end checks (first-time run, formation change, manual repositioning, Daily, Run It Back, challenge create → open in French, malformed link, all 14 solo modes + weekly from the Modes sheet, 320 px Spanish run).

## V1.7 — content scale, football knowledge, long-term retention (engine v5)

No redesign and no new economy: no currency, packs, XP, battle pass, energy, wheels, countdowns or streak loss.

- **Dataset, audited.** 214 team eras (164 club, 50 national), 3,017 PlayerEras, 2,312 identities, 501 with 2+ versions; 36 eras from the 1950s–70s and 32 from the 1980s. `scripts/data-audit.ts` checks duplicates, missing/invalid positions, invalid eras, rating anomalies, missing roles, empty teams, candidate diversity (squad size, thin lines) and implausible version jumps; report in `docs/data-quality.md` (0 errors, 70 editorial warnings). Twelve namesake collisions found and split with explicit ids (Coutinho of Santos vs Philippe Coutinho, Falcão vs Falcao, Marcus vs Lilian Thuram…).
- **Rating metadata** (`getPlayerEraMeta`): `ratingVersion` (r1), `ratingConfidence` (high: core files; medium: expansion; low: expansion before 1980) and `ratingRationale` (era level, role archetype, explicit adjustments → derived overall). ERA XI's own model; no commercial ratings copied.
- **Nationality for every player** (`src/data/nationality.ts`, lazy chunk): 719 taken from national-team squads in the dataset, the rest authored and blind-checked (117/120 agreement; the 3 misses were namesake bugs, now fixed). 2,246 high confidence, 61 medium, 5 low; dual nationals keep both codes. Historical states (USSR, Yugoslavia, Czechoslovakia, GDR…) keep their own names.
- **Knowledge Layer** (Settings: Minimal / Standard / Deep, default Standard). Never a mandatory tap: after a pick, a one-line insight appears while the next round is already live (Standard: at most 3 facts and 4 new-role lines per draft; Deep: every pick, tappable into the profile). Facts are structured and sourced (`src/knowledge/facts.ts`: World Cup, Euro, European Cup/Champions League results, Ballon d'Or), rendered from templates in three languages; sources are kept in data, not shown in play.
- **Player profile**: role, positions with the per-position penalty, ERA XI rating with **WHY 93?** (elite / strong / limited attributes, best role), TEAM IMPACT for this XI (FIT delta, where he lands) kept separate from quality, sourced facts, other versions, your history with him, and a collapsible "rating model" line.
- **Role School** (21 entries: 19 roles + regista + inverted full-back; what it does, strengths, what it needs, examples from the dataset) and **formation notes** (strengths / needs / risk, 13 formations). Outside the draft loop: Passport, profiles, formation sheet, weekly card.
- **Collection:** Passport gains nationalities met and "players you meet most" (seen / drafted / best). **My XIs** gallery: every finished XI is saved (seed, formation, mode, score, ratings); Best / Recent / Saved tabs; reopen, star, share, replay the same draw. Category bests (season, IQ, FIT, attack, history) only appear after enough runs. One non-blocking **new era / new nation discovered** line after a run, never on the first game.
- **Moments:** season reveal keeps at most two prominent milestones (38 wins, unbeaten, 100 points, 19/19, on course for your best…). **PERFECT ERA** (114/114): its own result frame and share card, sober.
- **Weekly themes** now carry a role of the week and a recommended mode; new themes: the 1990s, Italy (by nationality), No 10s.
- **YOUR DRAFT** (Analysis): star power, balance, discipline, risk, one line from counted decisions (e.g. "3 times you passed on the highest rating for a better fit").
- **Pick consensus / contrarian picks:** event shape (options, position, formation, mode) and aggregation are backend-ready; nothing is displayed until a real sample exists (`MIN_SAMPLE`). No invented percentages.
- **Engine v5 — identity damping.** Multi-version icons were over-offered (Cristiano 18.4% of drafts, Messi 16.0%). v5 divides a player's draw weight by his number of versions: 13.9% / 12.5%, top-1% share 6.4% → 5.3%, calibration −0.7 pts mean (CALIBRATION.md §7, `docs/diversity-audit.md`). v2–v4 links replay unchanged.
- **Performance.** Educational content, nationality and the French/Spanish catalogs are their own chunks (the active language is awaited before first paint, so no language flash). First-load JS 1,012 KB → 908 KB raw, 282 KB gzip (V1.6: ~289 KB). Dataset init 16 ms, one draft's eras 4.4 ms (`scripts/data-perf.ts`).
- **Localisation:** 96 new keys in FR/EN/ES; `docs/glossary.md` fixes the football vocabulary per language; names are never translated.

Quality gates: 180 unit tests (21 in `tests/v17.test.ts`: data integrity, namesakes, nationality, facts, knowledge catalog parity, collection, milestones, decisions, damping, on-demand catalogs); `e2e/run.mjs` 23 checks (new: non-blocking insight + My XIs + Role School; French first paint and on-demand Spanish); PWA offline playtest, mobile audit (14 screens × 7 viewports, EN and FR) and `scripts/perf.mjs` re-run on the production build.

## V1.8 — product clarity, football depth, retention polish (engine v6) · feature freeze

No redesign, no new economy. Every new element was checked against "does a first-time player need this now?" (`docs/complexity-audit.md`).

- **Home.** "Compose an impossible XI" + one paragraph (first 3 games), `11 PICKS · 38 MATCHES · 114 PTS MAX`, `HOW TO PLAY →` (opens Help, no carousel). **One contextual primary action** (`game/homeCta.ts`): RESUME · n/11 → REMATCH (a named friend beat you, last 72 h) → TODAY'S XI → BEAT YOUR n (1–5 pts short, last 48 h) → PLAY. Never two primaries.
- **Football identity, a notch up:** pitch lines under the Home title, the formation drawn on a pitch, the rules as a match card, a "live" dot during the season, the season as a 38-match form strip on the result, "ta compo" wording. Same ink / chalk / volt identity.
- **Help Center** (`?` next to Settings; lazy chunk per language): How to play, Ratings & PlayerEra, FIT, Positions, Formations, Modes, Daily XI, Challenges & Duels, Era League / 114, Tactical roles, Glossary. Short first, `MORE +` for depth. Contextual `?` / links open the right section from FIT, ratings, formations, modes.
- **My ERA** (Home header, after the first game): career line (games, record, average, duel record, players), activity feed (20 max: rivals' results, personal bests, eras / nations discovered, achievements), rivals (`FLO 7 — 5 ANTHONY`, averages, bests, REMATCH; ≥ 3 games vs the same named friend), best XIs, gallery, Passport, records, achievements / Draft DNA — each only with data.
- **Era Passport with context:** every one of the 234 team eras has sourced context (coach, honours won inside the span, a documented style tag where one exists; `src/data/eraMeta/`, lazy), shown with how much of the squad you have discovered (`Discovered 33%`). Player history adds skipped and preferred position.
- **Data:** 20 eras added for Africa (Ghana 2010, Ivory Coast 2006, Egypt 2008, Algeria 1982, Cameroon 2002, Al Ahly 2005), the Americas (Mexico 1986 & 2018, USA 2002, Costa Rica 2014, Colombia 2014, Paraguay 2010, Peru 1970, Club América 1984, Independiente 1972) and Asia/Oceania (Iran 1998, Saudi Arabia 1994, Australia 2006, Japan 2010, Al Hilal 2019); squads checked against Wikipedia squad lists; namesakes split with ids. Now 234 eras, 3,336 PlayerEras, 2,597 players, every player with a nationality. Per PlayerEra: tacticalNote, historicalNote (sourced fact), ratingRationale, ratingVersion, sourceMetadata.
- **Engine v6:** themed weeks can guarantee rounds from a featured side — new themes **AC Milan** (2 rounds) and **Brazil** (4 rounds), plus the 2000s — and the **Daily XI follows the week's theme**. v2–v5 links replay unchanged. Calibration: competent 89.4 mean, 12.0% at 100+ (CALIBRATION.md §8).
- **Result / Analysis:** `2 PTS FROM YOUR RECORD · TRY AGAIN`, Run it back with "same draw, new picks", `REPLAY FROM ROUND n` once Analysis found a turning point (practice only, never counts). Analysis first layer: why, strengths / weaknesses, position problems with the penalty; details collapsed.
- **Draft insights** in the brief's format (`BUILD-UP ↑ Pirlo — deep playmaker…`), still non-blocking, still governed by Minimal / Standard / Deep.
- **Performance:** Help, era context, knowledge and nationality are separate chunks; the next two rounds' squads are materialised in idle time.
- **Feature freeze:** no new modes or systems from here unless they fix a clear product problem.

## V1.9 — football DNA & mobile first

Football identity from behaviour and language, not decoration; no new mode, no new economy, engine unchanged (everything is presentation, `src/engine/tactical.ts`). Screen-by-screen audit: `docs/football-dna-audit.md`.

- **Tactical reading of the XI** (deterministic, tested): line completion, role complementarity (control core, balanced midfield, flank overloads, elite CB pair, build-up link, false nine & runners, strike partnership, crosses for a target man), tactical identity, structural players, game plan. Norms from 600 v6 drafts. No shared-club / nationality chemistry.
- **Draft:** option cards give name, positions, role, landing slot, rating and **one** predicted impact (FIT swing, else `CREATION ↑`). The pitch lights a line when it is completed (`DEFENCE COMPLETE ✓`, `MIDFIELD BALANCED`, `NO BALL WINNER`) and names new connections — in the existing tactical chip, one at a time, never blocking.
- **Team sheet:** tactical identity, key creator / balance player / main threat, connections drawn between players on the pitch, `GAME PLAN →` (in possession · creation · without the ball · main threat).
- **Season broadcast:** fixture lines home side first (`BARCELONA · 2011 2–2 ERA XI`), `FIRST POINTS DROPPED` milestone, stale beats skipped.
- **Analysis:** `WHY 104 PTS?` → what worked / what cost you points / turning point, then `FULL ANALYSIS →`.
- **Football DNA** (Passport, My Era): archetype + preferred formation, role, era, behaviour and six football axes, from ≥ 20 runs with ≥ 10 recorded XIs.
- **Touch:** pressed states on the new controls, subtle haptics (if enabled) for a real tactical improvement, a personal best and Perfect Era — on the result screen, never during the reveal.
- **Language:** `Play the season`, `XI` instead of "Team", glossary extended.

## V2.0 — football brand polish, content expansion, multiplayer QA (engine v7)

No redesign, no new mode, no economy. Old links replay on their own pool (v2–v6 unchanged).

- **Brand:** a proprietary mark (`EraMark`: centre circle, kick-off spot, halfway line stopping short) used as punctuation only: loading identity, pitch-line separator (`PitchRule`), mode navigation, My ERA, result header, share card signature, empty states. Volt now reserved for the primary CTA, the selected player/slot, positive tactical change, personal record, Perfect Era and competitive state; the hero XI is an outline, chalk and pitch-line elsewhere (`--color-pitch-line`). Brand moments live inside existing frames and take no layout: `BUILD YOUR ERA` (draft, first frame), `TEAM SHEET COMPLETE`, `SEASON KICK-OFF` / `FULL TIME` (broadcast header), `PERFECT ERA`. The draft choice is still fully visible at 390×844 and 320×568 (measured).
- **Content:** 49 team eras (35 clubs, 14 national sides, 1953–2016): **283 eras, 4,024 PlayerEras, 3,100 players, 629 with several versions**; nationality for all 3,100; sourced era context (coach, honours) for all 283 eras; tournament results for every national era.
- **Validation:** `src/data/validate.ts` (duplicates, ids, dates, labels, team/nation references, positions/roles, attribute and rating ranges, keeper data, line depth per era, era context and tournament coherence). `tests/data-integrity.test.ts` makes `npm test` fail on any critical error; `npm run validate:data` prints the report (`docs/data-quality.md`, with a geographic coverage table).
- **Diversity:** 10,000-draft audit (`npm run audit:diversity -- 7`, `docs/diversity-audit.md`): 99.8% of players and PlayerEras offered, top 1% = 5.8% of exposure, 2.3% overlap between consecutive games, no repetition flag. Calibration v7: `CALIBRATION.md` §9.
- **Multiplayer:** audit and 13 fixes (`docs/multiplayer-audit.md`): expired vs unknown rooms, sweep on every path, idempotent lock retry, engine-mismatch refusal, instant resume on unlock/online, single in-flight poll, seat token in a header, party host migration, explicit `duelPhase` state machine, "Finish solo" when the opponent leaves, ATT/MID/DEF/FIT under the /114 duel score, "This draw, solo". Tests: `tests/v20.test.ts` + two-browser `npm run qa:duel` (iPhone-size EN vs Android-size FR, 18 checks). Founder script: `MULTIPLAYER_QA.md`. Dev-only diagnostics: `localStorage["eraxi:debug"]="1"`.
- **Fix:** a season beat (e.g. `MD 1 · FIRST DEFEAT`) could stay on screen for the whole broadcast; hide timers no longer cancelled by the matchday tick.
