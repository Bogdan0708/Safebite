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

## Stop 5: refresh read cost

Run 2026-10-10 against the emulators (`demo-safebite`), base `af470af`, Chromium via Playwright.
Spec: `stop-5-cost.spec.ts` (run from a temporary copy `web/e2e/zz-probe-5b-cost.spec.ts`, removed afterwards).
Log: `/home/godja/.claude/jobs/ecbf7290/tmp/plan-5b-stop-5.log`. Household: 100 restaurants, 5 claims each, 4 notes on
half of them (50 empty notes queries), no collection documents.

```
STOP5 {"queries":202,"documents":800,"emptyQueries":51} estimatedBilledReads=1053 perHourAt4=4212
```

Estimate only: the emulator does not bill. `estimatedBilledReads` = documents + one minimum read per empty query +
one rules `get()` per query. One full refresh of this household is ~1050 reads; four per hour while visible is ~4200.
Plan 5c checks the pilot's real usage. The Auth module is imported with the `?v=` URL `/src/firebase.ts` uses (the
Task 1 finding, applied by controller ruling), not the bare deps path in the brief.

**Free-tier finding (review of Task 8).** The measured cost exceeds the free tier. At ~4,212 reads per hour per visible device, two
devices visible for eight hours make 2 × 8 × 4,212 ≈ **67,400 reads a day** from the 15-minute timer alone. That is above
the 50,000-read daily free tier named in spec §3.9 "Cost". The interval review planned for 5c (first lever: 30 minutes,
which halves timer traffic) is therefore triggered by this measurement, not by assumption. The figure is also a floor
for this household size: the probe seeded **no collection documents**, and a real shortlist/visited list adds up to N
more reads per refresh (up to 100 here).

**Owner follow-up (2026-10-11): interval moved to 30 minutes.** The copy refresh now runs every 30 minutes while
visible (`COPY_REFRESH_INTERVAL_MS`), so the timer makes ~2,106 reads per hour per visible device: 2 × 8 × 4,212 ÷ 2 ≈
**33,700 reads a day** for the recorded scenario. A separate membership check now runs every 15 minutes while visible
for every member (`MEMBERSHIP_CHECK_INTERVAL_MS`): one server read of `users/{uid}` and one of `households/{hid}`,
about 2 reads per check, 8 an hour per visible device, 2 × 8 × 8 = **128 a day**. Together ≈ **33,800 reads a day**,
inside the 50,000-read daily free tier for this scenario (two devices, eight visible hours, 100 restaurants, no
collection documents). The floor caveat above still applies; Plan 5c still checks the pilot's real usage.
