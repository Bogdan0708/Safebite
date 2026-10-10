# Plan 5b empirical stops 1-2: results

Run 2026-10-10 against the emulators (`demo-safebite`), base `0df3fb1`, Chromium via Playwright.
Spec: `stop-1-2.spec.ts` (run from a temporary copy `web/e2e/zz-probe-5b.spec.ts`, removed afterwards).
Logs: `/home/godja/.claude/jobs/ecbf7290/tmp/plan-5b-stops-1-2.log` (first run, spec verbatim from the brief) and
`/home/godja/.claude/jobs/ecbf7290/tmp/plan-5b-stops-1-2-diag.log` (corrected spec, the numbers below).
Commit: the commit that adds this file.

| Probe | Mode | first.ms | readMs | code | Consequence |
|---|---|---|---|---|---|
| Stop 1 | airplane (routes aborted, `navigator.onLine=false`) | 483 | 24 | `unavailable` ("client is offline") | `MEMBERSHIP_TIMEOUT_MS` stays 6000 (the server read fails in ~24 ms) |
| Stop 1 | stall (requests held, `onLine` true) | 30375 | 10012 | `unavailable` ("client is offline") | `EARLY_OPEN_MS` stays 3000: a stall delays the first auth callback by ~30 s (Auth request timeout), so the early opening is needed; the stalled server read itself fails after ~10 s (Firestore connect timeout), which is longer than the 6000 ms membership timeout, so the timeout, not the SDK, ends it |
| Stop 2 | expired token, offline, then reconnect | restored uid `ava-uid` | n/a | n/a | Stop 2 holds: the stored user is restored offline with an expired token, still signed in 10 s later, and `getIdToken()` returns a token (>100 chars) after reconnection. `offlineMember` can be built as designed |

## Deviation from the brief (finding)

The spec as written in the brief imports Firestore from the bare path `/node_modules/.vite/deps/firebase_firestore.js`.
`src/firebase.ts` is served with a `?v=<hash>` query on that import, so the bare path is a second module instance:
`doc(db, ...)` then throws `invalid-argument` synchronously (first run: `readMs: 0`, `code: "invalid-argument"`,
all three tests still "passed" because they only assert the uid). The committed spec resolves the same URL that
`/src/firebase.ts` uses. First-run `first.ms` values (534 airplane, 30400 stall) matched the corrected run
(483, 30375); only the read figures were invalid. The existing `auth-persistence.spec.ts` does not use Firestore,
so this trap is new for any Plan 5b e2e test that loads Firestore from the harness.

Airplane `first.ms` (483) is under 6000, so no "waiting copy from app start" change is needed.
