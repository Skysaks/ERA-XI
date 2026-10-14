# ERA XI — Live Duel: manual QA script

For a person, not a developer. Two phones, 20 minutes. Tick **PASS** or **FAIL** for every line.
If a line fails, write what you saw and the time next to it, and take a screenshot of both phones.

**You need**
- Phone A: an iPhone (Safari). Phone B: an Android phone (Chrome). If you only have one kind, use a laptop as Phone B.
- Phone A set to **English**, Phone B set to **French** (phone language, or the FR/EN/ES switch on the first screen).
- The site open on both phones: the production address, not a local one.

**Before you start:** on both phones, close every ERA XI tab, then open a fresh one.

---

## 1. Create and join

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 1.1 | A | Home → **LIVE DUEL** → type a name → **CREATE DUEL** | A room code and a link appear. | ☐ | ☐ |
| 1.2 | A | Send the link to Phone B (message, AirDrop, email). | — | | |
| 1.3 | B | Open the link. | A page in **French** says who invited you and "Le meilleur XI gagne." | ☐ | ☐ |
| 1.4 | B | Type a name → **JOUER** | Both phones switch to round **01 / 11** within 2 seconds. | ☐ | ☐ |
| 1.5 | A + B | Compare the screens side by side. | Same team and era (e.g. "Barcelona 2008–2012"), **same four players in the same order**. Only the app's words differ (EN vs FR). | ☐ | ☐ |

## 2. Secret picks and reveal

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 2.1 | A | Tap a player. | A shows **"Locked · [B's name] picking…"**. No spinner, no frozen screen. | ☐ | ☐ |
| 2.2 | B | Look at the screen (do not tap). | B sees **"[A] a validé"** but **not which player** A took. | ☐ | ☐ |
| 2.3 | B | Tap a player. | Within 2 seconds both phones show both choices ("→"), then move to round 02. | ☐ | ☐ |
| 2.4 | A + B | Round 2: **both tap the same player** (agree beforehand). | Allowed on both phones. Both get him. | ☐ | ☐ |
| 2.5 | A | Round 3: tap a player **twice very fast**. | Only one pick is taken. No error message. | ☐ | ☐ |

## 3. Refresh (reload the page)

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 3.1 | A | Round 4: tap a player, then **pull down to reload** before B picks. | A comes back in the same duel, round 04, still "Locked". B still cannot see A's pick. | ☐ | ☐ |
| 3.2 | B | Tap a player. | The round reveals on both phones normally. | ☐ | ☐ |
| 3.3 | B | Round 5: right after both have picked (during the reveal), **reload**. | B comes back in the duel at the right round. Nothing lost. | ☐ | ☐ |

## 4. Network interruption (the most important section)

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 4.1 | B | Round 6: turn on **Airplane mode** for 15 seconds. | A sees "[B] reconnecting…" (not an error, not a spinner). | ☐ | ☐ |
| 4.2 | B | Turn Airplane mode **off**. | Within ~5 seconds B is back at the right round, A's status goes back to normal. | ☐ | ☐ |
| 4.3 | A | Round 7: **lock the phone** for 30 seconds, then unlock. | A is back in the duel at the right round without doing anything. | ☐ | ☐ |
| 4.4 | B | Round 8: switch to another app (WhatsApp…) for 30 seconds, come back. | Same: back in the duel, right round. | ☐ | ☐ |
| 4.5 | A | Round 9: tap a player **while in Airplane mode**, then turn Airplane mode off. | The pick goes through once connection is back (or A is asked to pick again). Never two picks, never a wrong pick. | ☐ | ☐ |

## 5. Result

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 5.1 | A + B | Finish rounds 10–11. | Both phones show the result screen. | ☐ | ☐ |
| 5.2 | A + B | Compare scores. | A's "You" score = B's score for A, and the other way round. Scores are **/ 114**. One phone says "You win", the other "[name] gagne". | ☐ | ☐ |
| 5.3 | A | Look under the scores. | ATT / MID / DEF / FIT for both sides, then the rounds where you picked differently. | ☐ | ☐ |
| 5.4 | A | **Reload** on the result screen. | The same result comes back. | ☐ | ☐ |

## 6. Rematch

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 6.1 | A | Tap **REMATCH**. | A shows "Waiting for [B]…". B's button now says "[A] veut une revanche". | ☐ | ☐ |
| 6.2 | B | Tap it. | Both phones start round 01 of a **new** draw (different team than the first duel), identical on both phones. | ☐ | ☐ |
| 6.3 | A + B | Next result: **both tap REMATCH at the same moment**. | One new draw starts, same on both phones. No error. | ☐ | ☐ |
| 6.4 | A | On a result screen, tap **"This draw, solo"**. | A replays the same draw alone, marked practice. Not counted in duel records. | ☐ | ☐ |

## 7. Someone leaves

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 7.1 | A | During a duel: home icon → **Leave**. | A is back on the home screen. | ☐ | ☐ |
| 7.2 | B | Look at the screen. | B sees "[A] est parti · Finir en solo ›" (after at most one pick). | ☐ | ☐ |
| 7.3 | B | Tap **Finir en solo**. | B continues the same draw alone from the same round, as practice. | ☐ | ☐ |

## 8. Bad links

| # | Who | Do this | Expected | PASS | FAIL |
|---|---|---|---|---|---|
| 8.1 | A | Open the site address followed by `/r/zzzzz`. | "That room has closed or never existed." with a Practice button. | ☐ | ☐ |
| 8.2 | B | Open a duel link from **yesterday**. | "This room has expired…" (rooms close after 3 hours without activity). | ☐ | ☐ |
| 8.3 | C | With a duel in progress, open its link on a **third** phone. | "Room full" message. The duel on A and B continues normally. | ☐ | ☐ |

---

## Verdict

- **Launch-ready** only if every line in sections 1–5 passes, and section 4 passes **twice in a row**.
- Sections 6–8 failing = fix before announcing multiplayer publicly.

Known limits (not bugs, do not mark FAIL for these):
- Rooms live in one server's memory: a server restart or redeploy ends every open duel.
- If both phones lose the network for more than 60 seconds, each sees the other as "left".

Tester: ______________ Date: __________ Phones / browsers: ______________________
