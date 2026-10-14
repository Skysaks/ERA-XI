# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: **Security → Report a vulnerability** on this repository
(GitHub private vulnerability reporting). Include:

- what is affected (route, component, file) and the version or commit;
- steps to reproduce, or a proof of concept;
- the impact you expect (data exposure, cheating in rooms, denial of service…).

You will get an acknowledgement within 7 days. Please allow a reasonable delay for a fix
before any public disclosure.

## Scope

In scope: the game client, the room API (`/api/rooms`), challenge-link verification and the
service worker. Out of scope: denial of service by raw traffic volume, issues in third-party
dependencies already tracked upstream, and findings that require a compromised device.

## What is already in place

- Every request to the room API is size-capped, schema-validated (zod, strict objects) and
  rate-limited per address; scores are recomputed server-side from the picks.
- Hidden picks are redacted per viewer until a round is revealed.
- Production responses send a same-origin Content-Security-Policy, HSTS, `nosniff`,
  `X-Frame-Options: DENY` and a restrictive Permissions-Policy.
- Challenge links are self-verifying: replayed by the engine, a forged score is rejected.
- Dependencies are watched by Dependabot and `npm audit` runs in CI.
