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
| 5 refresh read cost | Task 8 | — |

## Ledger

- Task 3: dev dependency `fake-indexeddb` resolved to 6.2.5. Rulings applied: write phase of `replaceCopy`/`replaceRestaurant` aborts the transaction on a synchronous throw; stop 4 waits on a `__held` signal from tab B instead of a 100 ms sleep.
