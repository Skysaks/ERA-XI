# ERA XI — complexity audit (V1.8)

Question asked of every element added in V1.8: **does a first-time player need this right now?**
If not, it lives behind Help, My ERA, Analysis or a sheet. Home and the default draft stay simpler than
the rest of the product.

## First visit (0 games): what is on screen

| element | why it is there | disappears when |
|---|---|---|
| Title + one-paragraph explanation | the whole game in 2 sentences | after 3 games |
| `11 PICKS · 38 MATCHES · 114 PTS MAX` | the rules as numbers | never (one line) |
| `HOW TO PLAY →` | opens Help at "How to play"; no carousel | after 5 games |
| Language switch | first-visit choice | after the first game (then in Settings) |
| `?` and settings | always reachable, 44 px | never |
| Mode (Classic / Football IQ) + 4 formations + `+9` | unchanged since V1.6 | never |
| **PLAY** | the only primary action | replaced, never joined, by a contextual action |
| Daily XI card, Duel, Modes → | secondary, below PLAY | never |
| Pitch watermark, formation diagram | decoration (football identity), no interaction, `aria-hidden` | hidden on short screens |

Nothing else is added for a new player: no My ERA entry (it appears after the first game, in the place of
the tagline), no rivals, no feed, no gallery, no badges.

## Later sessions: one primary action, chosen

`game/homeCta.ts`, in this order, one only:
1. unfinished run → `RESUME · n/11`
2. a named friend beat your challenge in the last 72 h, not answered → `REMATCH` + "Anthony beat you 98–91"
3. today's Daily not played (from the 3rd game on) → `TODAY'S XI` + the week's theme
4. last run 1–5 pts under the record, within 48 h → `BEAT YOUR 109` + "2 pts away"
5. otherwise `PLAY`

When the primary is not PLAY, a quiet text link keeps "Or a new draft: Classic · 4-3-3 →".

## Default draft

| element | layer | rule |
|---|---|---|
| Post-pick insight (`BUILD-UP ↑ Pirlo — deep playmaker…`) | on the pitch, non-blocking | never during the first-run guidance (rounds 1–3); Standard: at most 3 facts + 4 new roles per draft; Minimal: none; the next round is live under it (e2e-tested) |
| Player profile, WHY 93?, team impact | behind `i` | never opens by itself |
| Help `?` next to rating / FIT | inside the profile and FIT sheets only | not on the draft cards |
| Next-round squad warm-up | invisible | idle callback |

## Result

| element | layer |
|---|---|
| Season strip (38 marks) | passive, under W-D-L |
| CHALLENGE | primary social action, unchanged position |
| Play again / Run it back with a subtitle (`New draft` / `Same draw, new picks`); near miss → `2 PTS FROM YOUR RECORD · TRY AGAIN` | same two buttons, different words |
| `REPLAY FROM ROUND n` | only after Analysis found a turning point worth ≥ 1.5 pts, only where practice replays are allowed; never counts for Daily/ranked |
| Analysis | behind `ANALYSE MY XI →`; first layer = why + strengths/weaknesses + position problems; decision summary, FIT detail, matchday list collapsed |
| PERFECT ERA | only at 114/114; a frame and one line, no animation burst |

## My ERA (behind the Home header after the first game)

Every module renders only with data: career line (always), activity (≥ 1 event, 20 max), rivals (≥ 3 games
against the same named opponent), best XIs (category minimum runs: season 3, IQ 2, FIT 5, attack 5, era 2),
gallery / Passport / records (links), achievements (≥ 1 unlocked) or Draft DNA (≥ its minimum games).

## Help (behind `?`)

11 sections, each: 2–3 sentences, then `MORE +` for depth. Opened at the right section from FIT, ratings,
formations, modes and "How to play". Lazy chunk per language.

## What was cut or moved in this pass

- The Home tagline no longer competes with the language switch on phones < 420 px.
- `Players seen` → `Players` (the label was truncated in three languages).
- Rival cards need 3 games (2 made a 1–1 "rivalry" out of two challenges).
- The Passport's era context (coach, honours, style) is in the Passport only, never in the draft.

## Feature freeze

After V1.8: no new modes or systems unless they fix a clear product problem. Priorities: polish,
performance, balance, content quality, analytics, real-user feedback.
