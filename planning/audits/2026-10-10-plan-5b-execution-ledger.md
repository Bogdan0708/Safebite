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
| 5 refresh read cost | `STOP5 {"queries":202,"documents":800,"emptyQueries":51} estimatedBilledReads=1053 perHourAt4=4212` (100 restaurants × 5 claims, 4 notes on half; emulator estimate) | queries = 1 + 2 per restaurant + 1, as designed (no collection-group rule). **Exceeds the free tier:** 2 devices × 8 visible h × 4,212 ≈ 67,400 reads/day, above the 50,000-read daily free tier in spec §3.9 "Cost", so the 5c interval review is triggered by measurement, not assumption. The probe seeded no collection documents; a real shortlist adds up to N reads per refresh, so this is a floor |

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

Stop 5 cost: about 1,053 billed reads per full refresh (202 queries, 800 documents, 51 empty), about 4,212/h per visible device, about 67,400/day for 2 devices x 8 h, above the 50,000-read free tier. The 5c interval review is triggered by this measurement.

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
- Task 12: spec test 14 split into O14a/O14b (so +9, not +8, browser scenarios); `waitPastMembershipCheck` for the WSL2 clock. Finding: `copyUsable` treats a membership check dated in the future as expired with zero tolerance (spec rule kept; owner decision whether to allow a small tolerance).
- Task 13: the emulator does not deny an open listener when only `memberIds` changes; O12 forces a record write. In production, online loss of access is bounded by the 15-minute refresh denial, start-up, or a denied write; spec §3.9 R2-4/test 12 should say so (owner decision).
- Task 14: browser total is 74, not the brief's 73. `web/playwright.config.ts` `globalTimeout` raised 1,200,000 to 1,800,000 ms because the stress run (3 x 8.1 min) exceeds 20 min; comment updated.

Not run: real iPhone (stop 3 and the acceptance script) — owner-run after deploy.
