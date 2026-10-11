# Plan 5b execution ledger

Plan: `planning/plans/2026-10-10-safebite-pwa-05b-offline.md`. Spec: §3.9 at `7528c18`.
Branch `worktree-pwa-05b-offline`, base `c2d1324`.

## Baseline

| Suite | Count |
|---|---|
| Web unit | 529 (52 files) |
| Functions + rules | 441 (23 files) |
| Browser | 58 |

Typecheck clean.

## Empirical stops

| Stop | Result | Consequence |
|---|---|---|
| 1 offline timing | see `plan-5b-probes/results.md` (airplane first auth 483 ms, read fails 24 ms; stall first auth 30375 ms, read fails 10012 ms, both `unavailable`) | `MEMBERSHIP_TIMEOUT_MS` 6000 and `EARLY_OPEN_MS` 3000 stay |
| 2 expired-token restore | holds | stored user restored offline with an expired token, kept 10 s, refreshes on reconnection; `offlineMember` buildable |
| 3 iPhone storage | owner-run after deploy | — |
| 4 cross-tab serialisation | holds (Chromium, `e2e/offline-store.spec.ts`): a replacement queued behind another tab's held clear transaction returns `cleared`, meta stays null | epoch check inside the replacing transaction is sufficient |
| 5 refresh read cost | `STOP5 {"queries":202,"documents":800,"emptyQueries":51} estimatedBilledReads=1053 perHourAt4=4212` (100 restaurants × 5 claims, 4 notes on half; emulator estimate) | queries = 1 + 2 per restaurant + 1, as designed (no collection-group rule). **Exceeds the free tier:** 2 devices × 8 visible h × 4,212 ≈ 67,400 reads/day, above the 50,000-read daily free tier in spec §3.9 "Cost", so the 5c interval review is triggered by measurement, not assumption. The probe seeded no collection documents; a real shortlist adds up to N reads per refresh, so this is a floor. **2026-10-11:** the owner moved the refresh to 30 minutes: ≈33,800 reads/day with the membership check, inside the free tier (owner follow-up below) |

## Ledger

- Task 3: dev dependency `fake-indexeddb` resolved to 6.2.5. Rulings applied: write phase of `replaceCopy`/`replaceRestaurant` aborts the transaction on a synchronous throw; stop 4 waits on a `__held` signal from tab B instead of a 100 ms sleep.
- Task 8: rulings applied: m3 (first AuthProvider refresh test renamed "an opted-out member starts no refresh"), m4 (`vi.mock("../firebase")` up front in refresher.test), m16 (`useOptInVersion` subscribe hoisted to module scope), block-bodied hooks. Deviations: `serverQuery` takes `Query` (the brief's `Parameters<typeof getDocsFromServer>[0]` failed `tsc`); stop-5 probe imports Auth via the `?v=` URL from `/src/firebase.ts`.

## Final gate

| Command | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run test:unit` | run 1: 723 passed, 1 failed (`AuthProvider.test.tsx` "an unclassified read error during a quiet retry keeps offlineMember": `waitFor` for `getDocMock` to be called timed out after the `online` event; flaky). Re-run: **72 files, 724 tests passed** (baseline 529, +195) |
| `npm run emu:test` | run 1: 440 passed, 1 failed (`account.deletion.test.ts` "600 claims in many small chunks": 20 s timeout, with unhandled `RateLimiter … Request time should not be before the last token refill time` from `@google-cloud/firestore`, i.e. the WSL2 clock stepping back; functions are untouched by this plan). Re-run: **23 files, 441 tests passed** (unchanged) |
| `npm run emu:e2e` | **74 passed** (8.1 min); baseline 58, +1 stop 4 (Task 3), +9 Task 12, +6 Task 13 |
| `npm run emu:e2e:stress` | **222 passed** (74 x 3, 22.7 min), retries 0, no failures or flakes |
| `npm --prefix web run build:check` / `build:e2e` | both exit 0 |
| `e2e:boot-guard` | 1 passed |
| `e2e:preview` | 4 passed (offline-shell test needed no change) |
| `e2e:upgrade` | 7 passed |
| `git diff --check c2d1324 HEAD` | clean |
| legacy project string grep | only match is the plan's own constraint sentence ("must not appear in new files"); none in `web/src` or `web/e2e` |
| offline core Firebase-free grep | "offline core is Firebase-free" |

Stop 5 cost: about 1,053 billed reads per full refresh (202 queries, 800 documents, 51 empty), about 4,212/h per visible device, about 67,400/day for 2 devices x 8 h, above the 50,000-read free tier. The 5c interval review is triggered by this measurement. Resolved 2026-10-11 by the owner's 30-minute interval (≈33,800/day; owner follow-up below).

Flakes recorded, not hidden: the unit failure above (name captured this time; earlier 1 in 17 runs) and the emulator-suite failure caused by the WSL2 clock step.

### Commits (c2d1324..HEAD)

b204593, f709811, 9294048, 1b34ee2, 7528c18 (spec and design reviews); 0df3fb1 (plan); ebe25dd (probe stops 1-2); 8f20a18; 65a14e8; 0e7c26e; a278667; cc8b2e3; af470af; 76c7772; 9d15f83; 938bcf4; c7bad0d; 757b8c9; cdd86a8; 3152661; c7a2b76; 5648050; 39ad050; plus this task's docs commit.

### Differed from the plan

- Task 1: probe spec imports Firestore via the `?v=` URL (the bare path created a second module instance).
- Task 6: DeviceClearingScreen waits up to 6 s for another tab's run (two-tab pending-clear ping-pong); `store.ts` gained `hasMalformedMeta()`.
- Task 7: an unclassified error while reconciling a provisional opening goes to the error screen.
- Task 8: stop 5 exceeds the free tier, so the 5c interval review is triggered by measurement.
- Task 9: `useWatch` keeps the copy value only on a mode switch and holds a bridge lease across the offlineMember to member re-subscribe.
- Task 10: DeleteAccountPage gated (no brief covered it).
- Task 11: switch auto-off on a refused first write requires `lastFailure` "storage".
- Task 12: spec test 14 split into O14a/O14b (so +9, not +8, browser scenarios); `waitPastMembershipCheck` for the WSL2 clock. Finding: `copyUsable` treated a membership check dated in the future as expired with zero tolerance; the owner chose a 5-minute tolerance (follow-up below), and the helper stays as belt and braces.
- Task 13: the emulator does not deny an open listener when only `memberIds` changes; O12 forces a record write. Firebase documents that listener rules are re-evaluated when their dependent documents change, but whether production denies on a `memberIds` change alone is unverified (pilot check, iPhone acceptance step 9). Corrected 2026-10-11: a denied write shows an error but does **not** re-check membership, and a member who never opted in has no refresh to be denied. Online loss of access is now bounded for every member by the 15-minute membership check while visible (owner follow-up below); the copy refresh runs every 30 minutes.
- Task 14: browser total is 74, not the brief's 73. `web/playwright.config.ts` `globalTimeout` raised 1,200,000 to 1,800,000 ms because the stress run (3 x 8.1 min) exceeds 20 min; comment updated.
- O5 (spec test 5) uses **Clear device data** in tab B where the spec says sign-out: sign-out shares Auth state, so it also resets tab A and would discard the paused refresh instead of letting it try to write. Device clear runs the same `clearDeviceData()` and keeps tab A alive, so it is the stronger test of "nothing written back".

### Final review fix wave

Commit `8ee7e0a` (code and tests), plus the docs commit that adds this entry.

- I1: reconnecting from `offlineMember` after a household move reset the tab (its own invalidation broadcast) and lost the ruling-8 notice. `prepareMemberCopy` now writes a per-tab sessionStorage flag (uid, new household, time; try/catch) before `clearCopy()` when this document is showing copy data; the next member start with no mismatched copy reads it once (60 s window) and shows the notice. The conservative self-reset stays (old household data never stays on screen). Unit tests in `AuthProvider.test.tsx` and `decide.test.ts`; browser O7b.
- I2: the two `online`-event AuthProvider tests dispatch inside the retrying `waitFor` (the listener is attached by a passive effect); the 3000 ms timeout removed.
- M1: `finished(tx)` marks its promise handled at creation, so an aborted transaction under a failed read leaves no unhandled rejection.
- M2: `offlineCopyCleaner` clears the copy, bumps the epoch and clears every opt-in in one transaction.
- M3: `isMeta` requires finite revision and times; `copyUsable` fails closed on a non-finite age.
- M4: the refresher re-kicks when a request joined a loop that had already passed its last check.
- M5: the write observer's late `getOptIn` answer and the visibility trigger's late `ageOf` answer are ignored once their session or triggers have stopped.

Counts after the wave: web unit **737** (3 consecutive runs green, no flake), functions + rules 441 (untouched), browser **75** (`emu:e2e` 75 passed, 8.1 min; `offline-isolation.spec.ts --repeat-each=3 --retries=0` 21 passed).

Not run: real iPhone (stop 3 and the acceptance script) — owner-run after deploy.

## Owner follow-up (2026-10-11)

Owner-approved changes after the final review; spec §3.9 amended first.

1. **Refresh every 30 minutes; 15-minute membership check for every member.** `REFRESH_INTERVAL_MS` replaced by `COPY_REFRESH_INTERVAL_MS` (30 min: refresher timer and resume staleness) and `MEMBERSHIP_CHECK_INTERVAL_MS` (15 min: the new check and the `offlineMember` retry). While `member` and visible, every member, opted in or not, runs one quiet server membership read every 15 minutes; loss of access wipes and resets as a listener denial does; no answer or an unclassified error keeps the state. It skips while a denial read is outstanding or this tab's account deletion runs. A re-check confirming the same member keeps the current state (so a household-change notice is not dropped). Stop-5 estimate recomputed: ≈33,800 reads/day for the recorded scenario, inside the free tier.
2. **5-minute backward-clock tolerance.** `CLOCK_TOLERANCE_MS`; `copyUsable` accepts `-5 min ≤ age ≤ 30 days`; non-finite still fails closed; the 30-day expiry is not extended.
3. **Removal wording corrected.** Spec R2-4, the listener-denial bullet, browser test 12, Cost and Decisions; README guardrails; Task 13 entry above; iPhone acceptance step 9 (pilot check of listener re-evaluation versus the 15-minute check).

Commits: `9806d01` (spec), `c932bb1` (code and tests), plus the docs commit that adds this entry.

Counts: web unit **753** (737 + 16 new: AuthProvider 13, eligibility 2, refreshTriggers 1; `npm run test:unit` green twice), functions + rules 441 (untouched, not re-run), browser **75** (`emu:e2e` 75 passed, 7.6 min). Typecheck clean; `REFRESH_INTERVAL_MS` gone from `web/`; Firebase-free core grep clean.

Test note: the new AuthProvider block fakes only `setInterval`/`clearInterval` and waits with a small real-timeout `until` helper, because Testing Library's `waitFor` polls with `setInterval` (it would only re-check on DOM mutations, which made an IndexedDB assertion flaky) and `vi.waitFor` advances fake timers (which would fire the interval under test).
