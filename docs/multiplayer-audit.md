# ERA XI — Live Duel multiplayer audit (V2.0)

Scope: the Live Duel (1v1, lockstep, secret picks) and its compatibility with Party. Transport in
production: `HttpTransport` (polling `/api/rooms`, 600 ms) against the single authoritative `RoomServer`.
The standalone artifact build uses `PresenceTransport` (commit–reveal). Practice uses `MemoryTransport`.

## 1. Architecture as audited

| concern | how it works | verdict |
|---|---|---|
| Authority | `roomEngine.applyIntent` is the only state transition; the server never accepts a score, it replays the 11 option indices (`seasonFor`) | sound |
| Same opportunity | seed = f(room code, generation); both seats replay the same `createDraft` → identical offers, whatever the client language | sound (tested) |
| Secrecy | `snapshotFor` hides an opponent's pick for round *i* until the viewer has locked *i* and the round is revealed; strangers with the link see no pick and no score | sound (tested over HTTP) |
| Same player for both | picks are per-seat option indices; nothing forbids equal indices in lockstep | sound (tested) |
| Identity | seat token = device token (localStorage), sent in the `x-seat-token` header; re-join with the same token keeps the seat and all picks | sound |
| Language | shared state carries ids and indices only; every string is rendered by each client in its own language | sound (EN vs FR tested) |
| Engine version | a room records its `engineVersion`; a client that cannot replay it refuses the room | **fixed in V2.0** (was accepted silently) |

## 2. Weaknesses found and fixed

| # | weakness | effect before | fix |
|---|---|---|---|
| 1 | Expired rooms answered `not_found` | a late joiner was told "never existed" | tombstones for swept rooms → `expired` (HTTP 410), own message |
| 2 | Sweep ran only on room creation | a quiet server kept dead rooms forever | `maybeSweep()` at most once a minute on join and poll too |
| 3 | A lock whose response was lost was retried as a new lock | the retry got `out_of_turn` and showed an error although the pick was in | a retry treats `out_of_turn` as "already locked" (idempotent) |
| 4 | Engine mismatch not checked | an older client could play a newer room with a different pool | snapshot rejected → `version_mismatch`, "Reload to update" screen |
| 5 | Polling paused in background tabs until the next timer | up to one interval of stale state after unlock | immediate poll on `visibilitychange`, `online`, `focus` |
| 6 | Overlapping polls on slow networks | out-of-order snapshots, extra load | single in-flight request guard |
| 7 | Seat token in the query string | tokens in proxy/access logs | `x-seat-token` header (query still accepted from cached old clients) |
| 8 | Polling continued on a dead room | wasted requests forever | stops on `expired` / `not_found` |
| 9 | Party rematch needed the host | host gone → nobody could restart | host migration: first connected seat acts as host |
| 10 | Opponent leaves mid-duel | the remaining player was stuck: lockstep never advances | "[name] left · Finish solo ›": the same draw continues alone from the player's own picks, as practice (never recorded) |
| 11 | No explicit state model | UI states derived ad hoc | `duelPhase(state)`: CREATING, WAITING_FOR_OPPONENT, ROUND_ACTIVE, LOCAL_LOCKED, OPPONENT_LOCKED, REVEAL, RECONNECTING, DISCONNECTED, OPPONENT_DISCONNECTED, COMPLETED, REMATCH_PENDING, CLOSED |
| 12 | Duel result gave the score only | no read of why | ATT / MID / DEF / FIT side by side under the /114 score; different picks per round with the model's measured impact |
| 13 | No way to replay the draw | — | "This draw, solo" on the result (practice); REMATCH keeps a fresh seed |

The brief's READY and NEXT_ROUND states are transient in lockstep (both seated → round 1 opens at once;
reveal → next round) and are folded into ROUND_ACTIVE and REVEAL.

## 3. Edge cases: where each is covered

| case | automated | manual (`MULTIPLAYER_QA.md`) |
|---|---|---|
| create / join | `multiplayer.test.ts`, `v20.test.ts`, `playtest-v20-duel.mjs` | 1.1–1.4 |
| identical offers | `v20.test.ts`, browser (EN vs FR) | 1.5 |
| independent picks, same player | `v20.test.ts`, browser | 2.3–2.4 |
| secrecy | `v20.test.ts`, browser (server snapshot as seen by B) | 2.2, 3.1 |
| double tap / duplicate request | browser (one lock POST), 250 ms tap guard, in-flight guard | 2.5 |
| lost response → retry | `v20.test.ts` (flaky transport) | 4.5 |
| slow opponent | "Locked · X picking…" state | 2.1 |
| disconnect / reconnect | browser (12 s offline) | 4.1–4.4 |
| refresh while locked / during reveal / on result | browser | 3.1, 3.3, 5.4 |
| opponent / host leaves | `v20.test.ts` (party host), browser (duel: finish solo) | 7.x |
| room full, invalid code, expired | `multiplayer.test.ts`, `v20.test.ts`, browser (invalid) | 8.x |
| engine mismatch | `v20.test.ts` | — |
| language mismatch | browser (EN vs FR) | 1.3 |
| simultaneous rematch | browser | 6.3 |
| result validation (server replays, forged scores ignored) | `multiplayer.test.ts`, `playtest-duel.mjs` (malformed intent → 400) | 5.2 |

Run: `npm test` (unit), then `npm run build && npx next start -p 3001` and
`BASE=http://localhost:3001 OUT=/tmp/shots npm run qa:duel` (two browsers: iPhone-size EN + Android-size FR).

## 4. Diagnostics

`RoomDebug` overlay, development builds only (`NODE_ENV !== "production"`) **and** `localStorage["eraxi:debug"] = "1"`:
room code, seed, engine version, round / revealed-through, both seats' connection and lock state, transport
state and consecutive failed attempts. Renders nothing in production builds, whatever the flag.

## 5. Known limits (honest)

1. **Single instance, memory store.** `RoomServer` lives in one Node process. A redeploy or crash ends every
   open room; horizontal scaling needs a shared store (Redis, Durable Objects) before public load.
2. **Polling, not push.** 600 ms polling: reveals arrive 0–600 ms apart on the two phones. Acceptable for
   a turn-based duel; WebSockets would remove it.
3. **Reveal timing is client-local.** Each phone animates the reveal on receipt; the state is identical, the
   moment is not synchronized to the millisecond.
4. **Presence transport (artifact build).** Commit–reveal uses a sha256 commit truncated to 64 bits: enough
   against casual peeking, not a cryptographic guarantee against a determined peer.
5. **Both offline > 60 s** → each sees the other as gone; the room survives (3 h TTL) and re-joining with the
   same device restores the seat, but the UI will have offered "Finish solo" meanwhile.
6. **Not tested on real devices from here.** Browser tests emulate iPhone and Android viewports and touch in
   Chromium; Safari/WebKit specifics (background tab throttling on iOS) need the manual script.
