# Plan 5a execution ledger

Plan: `planning/plans/2026-10-01-safebite-pwa-05a-data-rights.md`, executed 2026-10-01/02 by subagent-driven development on `worktree-pwa-05a-data-rights` (5c496e1..9f82276). Spec: §3.8 as amended at 2ae1c9d.

Final gate at 9f82276: typecheck; web unit 452; functions + rules 427; browser 49; stress 147/147 (retries 0); boot-guard 1, preview 4, upgrade 7 (at c7a9dca).

## Carried into Plan 5b (hard requirements)

- The `pendingClear` marker is one boolean in localStorage, shared across tabs; concurrent clears can mask a failure. Use a per-run token or generation (or a cross-tab lock) before registering the IndexedDB cleaner.
- The `clearFailed` sign-in notice can be stale once start-up clearing has succeeded; reachable only once cleaners exist.

## Known host issues (local only)

- WSL clock steps backwards: Firestore emulator rate-limiter error from a shared default BulkWriter (test helpers now use per-call writers).
- ERR_NETWORK_CHANGED / socket hang-ups during e2e; boot-guard timeouts after a system clock jump. Reruns green.
- Flaky `auth.spec.ts:153` (password-change uncertain variant), pre-existing.

## Ledger

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1→T4,T5,T6 | `MARKER_UID`/`MARKER_NAME` in functions/src/account/marker.ts | consistent |
| T3→T4 | `markReceipt(db,id,next,nowMs)`, `startReceipt(db,id,uid,nowMs)` | consistent (T4 tests call startReceipt) |
| T3→T5 | `parseRequestId`, `receiptIdFor`, `checkReceipt(db,auth,id,nowMs)` | consistent |
| T4→T5 | `runDeletion(deps,uid,receiptId)`, deps `{db,auth,deleteTree,now}` | consistent |
| T5→T6 | `CALLABLE_OPTIONS`, callables.ts imports (HttpsError, logger, getFirestore, MARKER_UID) | consistent; T6 moves its import to top |
| T2 vs T1 | search test seeds households/home memberIds ["ava"]; member uid "ava" | consistent |
| T7→T8,T10 | `callable(name,{timeout})`, `clearDeviceData()` | consistent |
| T7 vs T9 | both edit AuthProvider.tsx/test (reset path vs states) | sequential, no conflict; T9 warns mocks must answer accountDeletions/* with undefined |
| T8→T9 | deleteMyAccount, finishDeleted, DeleteOutcome, checkDeletion, recoveryView, storage fns | consistent |
| T8→T10 | DELETE_TIMEOUT_MS in api.ts | consistent |
| T9 vs T10 | both edit SettingsPage.tsx/test (link vs ExportSection) | sequential; T9 adds MemoryRouter |
| T9/T10→T11 | testids delete-account-link, delete-consequence, delete-password/-submit, finish-*, pending-*, deletion-pending, signin-deleted-notice, export-prepare/-status/-share | consistent |
| T1 self | rules tests vs rules change | consistent |
| T2 self | 3 failing + 1 passing pre-impl | consistent |
| T3 self | tests vs receipts.ts (complete receipt refused on restart, uid removed) | consistent |
| T4 self | crash-before-step tests vs runner (record exists for step2..5; step6 crash leaves dataDeleted) | consistent |
| T5 self | recentAuth bounds (300 s, +60 s skew) vs tests (+30 pass, +600 fail) | consistent |
| T6 self | export expected JSON vs readExport (sort by name, createdAt order, expiresAt null) | consistent |
| T7 self | sync-throw cleaner wrapped via Promise.resolve().then | consistent |
| T8 self | order test [reauth,token,call,clear,signOut,reset] vs finishDeleted | consistent |
| T9 self | DeletePasswordForm testid prefix vs tests ("del"), recovery uses "finish" | consistent |
| T10 self | exportFile/ExportSection tests vs code | consistent |
| T11 self | scenario 3 assumes route.fetch then route.abort yields a network error | plan tells implementer to stop if not |

Scan clean; no rulings needed.

## Progress
Task 1: ⚠️ items checked by controller: trailers present, LF only.
Task 1: minor (deferred): seed guard test checks SEED_ACCOUNTS constant, not seedEmulator() throwing (plan-mandated)
Task 1: minor (deferred): no rules test of a write as former-member
Task 1: minor (deferred): 'former-member' literal twice in firestore.rules without a parity test/comment to marker.ts
Task 1: minor (deferred): new tests placed outside existing describe blocks
Task 1: note: plan said +9, real +8 (rules file has 6 tests); counts now web 361, fn+rules 360, browser 42
Task 1: complete (commits 5c496e1..05987c6, review clean)
Task 2: minor (deferred): "interleaving" search test is functionally equal to the deleted-household test; it does not pause between requireMember and the tx (plan-mandated); real guarantee is the in-tx check
Task 2: minor (deferred): search.ts step-3 comment line ~125 chars
Task 2: note: emulator suite last run before a comment-only re-wrap; counts web 361, fn+rules 364, browser 42
Task 2: complete (commits 05987c6..07cb868, review clean)
Task 3: ⚠️ resolved by controller: receipt deny rules landed in Task 1 (05987c6); TTL policy is Task 11 deploy note; hashing by callers is Task 5 (callables call receiptIdFor)
Task 3: minor (deferred): other-uid refusal test does not assert receipt unchanged afterwards
Task 3: minor (deferred): expireAt refreshed on every advance (7 days from last change) — undocumented
Task 3: minor (deferred): no test of checkReceipt rethrowing a non-user-not-found Auth error
Task 3: minor (deferred): two checkReceipt tests share receipt-uid on the shared emulator
Task 3: complete (commits 07cb868..b141e77, review clean); counts web 361, fn+rules 384, browser 42
Ruling: callable deleteTree (Task 5) uses a per-call BulkWriter (create, recursiveDelete(ref, writer), close in finally) — the shared default writer is poisoned by this WSL host's backward clock steps and the functions-emulator process is long-lived across e2e scenarios — cost if wrong: one extra writer per deletion, negligible
Task 4: review (opus) Needs fixes — Important: same-UID overlap past step 1 → loser NOT_FOUND on record update, receipt stuck at started
Task 4: Ruling: §3.8 "Logging: document counts" relaxed for 5a — runner returns only {lastMember}; Task 5 logs outcome, lastMember, duration — cost if wrong: less diagnostic detail in logs, add counts later
Task 4: minor (deferred): 450-claim test cannot detect a broken chunk size (452 writes < 500)
Task 4: minor (deferred): collection attribution test edits before the tx, not inside it
Task 4: minor (deferred): no crash mid-3a or on last-member path steps 4-6
Task 4: minor (deferred): concurrent two-member test omits receipts/users/records assertions
Task 4: minor (deferred): orphaned collection/{rid} (restaurant gone) not anonymised — narrow window from restaurant deletion ordering; query collection where updatedBy==uid would close it
Task 4: fix round 1/5 (1 addressed, 0 open; commits baa9c45..a7c8ac5)
Task 4: minor (deferred): skip path returns lastMember false even when the other call found last member (diagnostic only)
Task 4: minor (deferred): last-member skip path untested; B result asserted with toMatchObject({})
Task 4: minor (deferred): step 5 deletes the record unconditionally (only matters if the record could be recreated; not reachable today)
Task 4: complete (commits b141e77..a7c8ac5, review clean); counts web 361, fn+rules 402, browser 42
Task 5: note: first emu:test run had a transient failure in pre-existing discovery.callables.test.ts (likely host clock steps, same error Task 4 saw); rerun 415/415; no RED run recorded
Task 5: review Approved-conditional; Important: unresolved flake in discovery.callables.test.ts on first run; no RED evidence → fix round 1 (evidence gathering)
Task 5: minor (deferred): deleteAccount logs only on success (no outcome:error line)
Task 5: minor (deferred): "no uid in response" asserted only on status none, not on complete
Task 5: minor (deferred): no callable-level test of MARKER_UID refusal or recentLogin through HTTP
Task 5: fix round 1/5 (2 addressed, 0 open; evidence only, no commits)
Task 5: Ruling: the emulator-test flake ("Request time should not be before the last token refill time" from the shared default BulkWriter in test beforeEach recursiveDelete) is a host clock-step issue in pre-existing test setup, not task code; hardening test cleanup helpers to per-call BulkWriters is deferred to the final review's fix wave — cost if wrong: occasional local emu:test reruns
Task 5: complete (commits a7c8ac5..54830cd, review clean); counts web 361, fn+rules 415, browser 42
Task 6: ⚠️ resolved: restaurant name/address/phone/website are member-typed (owner ruling S1/F2, spec §3.6); marker.ts from Task 1
Task 6: minor (deferred): export reads are serial (2 per restaurant) — could approach 60 s near the size cap
Task 6: minor (deferred): no guard for docs lacking createdAt (TypeError → internal)
Task 6: minor (deferred): localeCompare without fixed locale; exportedBy falls back to "Former member" if caller lacks displayName
Task 6: minor (deferred): exportHousehold handler branches (unauthenticated/marker) untested; deleting exclusion and website only implicitly tested
Task 6: complete (commits 54830cd..3a04b87, review clean); counts web 361, fn+rules 421, browser 42
Task 7: ⚠️ LF verified by controller (no CR, diff --check clean)
Task 7: minor (deferred, matters in 5b): concurrent clearDeviceData runs share one boolean marker; a slower failing run can be masked by a faster success — coalesce in-flight calls before 5b registers a real cleaner
Task 7: minor (deferred): resetDocument throw inside .finally becomes an unhandled rejection (harmless: it only reloads)
Task 7: complete (commits 3a04b87..ac50471, review clean); counts web 371, fn+rules 421, browser 42
Task 8: review Needs fixes — Important (plan-mandated): "request id stored before the call" test is vacuous (assertion swallowed as a lost response)
Task 8: Ruling: fix the plan-mandated test (capture inside the mock, assert after) and also pin notice-before-key-clear-before-signOut ordering in the success test — the plan's test was wrong; the guarantee is load-bearing for recovery — cost if wrong: none
Task 8: minor (deferred): finishDeleted throwing makes deleteMyAccount reject after server-confirmed deletion
Task 8: minor (deferred): duplicated offline check in deleteMyAccount and reauthenticate (intentional)
Task 8: fix round 1/5 (2 addressed, 0 open; commits b4e914c..fc18089)
Task 8: complete (commits ac50471..fc18089, review clean); counts web 415, fn+rules 421, browser 42
Task 9: note: first emu:e2e run flaked auth.spec.ts:153 (password change internal-error variant, untouched flow); rerun 42/42
Task 9: review (opus) Needs fixes — Important (plan-mandated): unfinishedSignedIn recovery view has no Sign out (spec: "Sign out on this screen clears the key")
Task 9: Ruling: fix round also shows "Signed in as <email>" on the unfinished-signed-in view (guards deleting a different account signed in from another tab) and fixes the vacuous queryByRole("textbox") assertion — both cheap, spec-aligned — cost if wrong: one extra line of copy
Task 9: minor (deferred): clearFailed sign-in notice shown after start-up clearing already succeeded (stale)
Task 9: minor (deferred): recovery check effect has no cancellation (StrictMode double run, finishDeleted twice — harmless)
Task 9: minor (deferred): no tests for notice under StrictMode, Root gate precedence, unfinishedSignedOut copy
Task 9: minor (deferred): cosmetic — test indentation in AuthProvider.test.tsx, import order in AppShell.tsx
Task 9: minor (deferred, track): flaky e2e auth.spec.ts:153 (password-change uncertain variant)
Task 9: fix round 1/5 (3 addressed, 0 open; commits 1c5911d..d731079)
Task 9: complete (commits fc18089..d731079, review clean); counts web 438, fn+rules 421, browser 42
Task 10: ⚠️ LF verified (git ls-files --eol)
Task 10: minor (deferred): share result ignored — no confirmation after shared/downloaded; fallback download after NotAllowedError invisible
Task 10: minor (deferred): no re-entrancy guard on Share (double tap → InvalidStateError → unexpected download)
Task 10: minor (deferred): downloadFile untested (createObjectURL/click/revoke)
Task 10: minor (deferred): offline prepare keeps an earlier file in state
Task 10: complete (commits d731079..e4b8337, review clean); counts web 450, fn+rules 421, browser 42
Task 11: note: host flakes — first emu:e2e afterEach socket hang up on Auth emulator (rerun 49/49, stress 147/147 clean); boot-guard timed out twice after a ~10 h system clock jump (third run passed)
Task 11: minor (deferred): scenario 3 does not assert server-side deletion (passwordAccepted false)
Task 11: minor (deferred): restoreSeedAccounts has no retry on transient network errors (scenario 6 afterEach flake)
Task 11: minor (deferred): README has two adjacent deploy-order bullets (§3.7 and §3.8) — merge
Task 11: complete (commits e4b8337..c7a9dca, review clean); final counts web 450, fn+rules 421, browser 49, stress 147/147
Final review (opus): Ready with fixes — Important: step 3a re-runs serially per restaurant within 60 s timeout → large household can never finish deletion
Final: Ruling: one fix wave covers Important 1 + Minor 1 (blocked sessionStorage → recover in place), Minor 2 (low concurrency on checkAccountDeletion), Minor 3 (README guardrail: never provision former-member), Task 4 orphaned-collection pass, Task 5 per-call BulkWriter test helpers (close rd() writer), Task 4 chunk-size hardening, Task 11 scenario 3 server-side assertion, README deploy-bullet merge — all cheap and in the files already touched — cost if wrong: a larger fix diff to review
Final: Ruling: commit author email policy is the owner's decision (main already carries it on 142 commits) — surface at finish, do not rewrite
Final: carry to 5b brief as hard requirements: cross-tab-safe pendingClear marker (per-run token/generation); stale clearFailed notice
Final fix wave: done (commits c7a9dca..9f82276); host network flakes on two e2e rounds before green; F3 premise wrong (emulator accepts 600-write tx) — test counts transactions instead; F1 300-restaurant deletion 4.8 s (old 15 s)
Final fix wave re-review (opus): all F1–F8 addressed, no new Critical/Important
Final: minor (deferred): in-place recovery (blocked storage) unmounts if an ancestor swaps screens after step 2 — user still reaches finish-deleting via NotInvited/pending screen
Final: minor (deferred): pool rethrows lowest-index worker's error, not first in time
Final: minor (deferred): attribution-race test no longer deterministic under the pool (still sound via tx re-read)
Final: minor (deferred): nothing pins default chunk ≤ 249 (2×chunk+2 < 500); emulator does not enforce the 500-write limit
Final: note: ERR_NETWORK_CHANGED host flakes added to known host issues
Final review: clean after one fix wave (commits c7a9dca..9f82276)

## Correction round after the implementation audit (Tasks 12–14)

Spec amended at dc30ae5 and a2b1bfe (auditor re-review); plan addendum a251a0e + a2b1bfe. Commits 6cf6883..419e33f. Final review of the round: ready to merge, no Critical/Important. Gate at 419e33f: typecheck; web unit 481; functions + rules 441; browser 50; stress 150/150 (first run 147/150, three 'Loading…' stalls in untouched files, no link to the diff found); boot-guard 1, preview 4, upgrade 7.

Pre-deploy check (2026-10-02, read-only): both pilot members have a users document with householdId 'home' and a memberIds entry; no 'former-member' UID exists.

Open before 5b or the next provisioning: make provisioning write users/{uid} before memberIds (a uid in memberIds without a users doc takes the Auth-only path); align 'device data is cleared either way' with finishDeleted, which skips cleanup when another account is already current at its first check.

## Addendum (Tasks 12–14) — implementation audit 2026-10-02, spec dc30ae5 + a2b1bfe

Pre-flight scan (addendum):
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T12→T13 | server `deleteAccount({requestId, expectedUid})`, `details.reason "accountChanged"` | T13 api type + classifyCallError consume both; consistent |
| T12 self | receipts tests vs reconciliation (users+record+Auth absence); "started as is" now creates its Auth user; Auth-only fixtures are real states | consistent |
| T13A→T13B | DeletionRequest, recoveryView(check, requestUid, currentUid), deleteMyAccount(pw, expectedUid), finishDeleted(requestUid)→FinishResult, DeleteOutcome accountChanged/deletedOtherAccount | consumed by DeletePasswordForm, DeletionRecoveryScreen, App; consistent |
| T13 vs T9 code | AuthState notMember/deletionPending gain uid | NotInvited/DeletionPending read state.uid; consistent |
| T13→T14 | testids recovery-other-account, recovery-unavailable, recovery-continue, recovery-confirmed, delete-other-account | T14 uses recovery-other-account/-unavailable/-continue; consistent |
| T14 self | scenario 4 now expects recovery-unavailable then deletes again; scenario 8 seeds record+receipt+session key | consistent; seedReceipt hash matches receiptIdFor (sha256 hex) |
Scan clean; no rulings needed.
Task 12: note: server now requires expectedUid; the current web client omits it, so browser deletion scenarios break until Task 13 lands (expected, interim)
Task 12: minor (deferred): users/{uid} is the only membership index — a uid in memberIds without a users doc takes the Auth-only path and reconciles complete while listed (provisioning writes not atomic; pre-existing)
Task 12: minor (deferred): a record with non-string householdId is treated as Auth-only (unreachable today)
Task 12: minor (deferred): no real interrupted-run + external Auth deletion test asserting started stays started
Task 12: minor (deferred): accountChanged asserted by substring, not error.details.reason
Task 12: complete (commits a2b1bfe..6cf6883, review clean); counts web 452, fn+rules 441, browser (deletion scenarios interim-broken until Task 13)
Task 13: review (opus) Needs fixes — Important: in-place recovery passes an inline request object; check effect keyed on it restarts on every outer re-render (online/offline flip) → unmounts finish form, duplicate finishDeleted, stale overwrite
Task 13: Ruling: fix round also removes the success-message flash (show success only after finishDeleted returns "finished") — cheap, avoids the other account briefly seeing "Your account has been deleted" — cost if wrong: none
Task 13: minor (deferred): uncertain view says "your account" to a different signed-in account (copy only, no form)
Task 13: minor (deferred): redundant user.uid check in unchanged()
Task 13: fix round 1/5 (2 addressed, 0 open; commits 1ddd21c..01429c0)
Task 13: minor (deferred): stale-result generation guard has no dedicated test (restart path covered)
Task 13: complete (commits 6cf6883..01429c0, review clean); counts web 481, fn+rules 441; browser: only scenario 4 failing by design until Task 14
Task 14: note: first stress run 147/150 — C3, C8b, discover 1 stalled at Loading… consecutively in repeat 1 (files untouched; matches the earlier ERR_NETWORK_CHANGED Loading… stalls); rerun 150/150
Task 14: minor (deferred): scenario 4 does not assert the second deletion removed Ava (passwordAccepted false)
Task 14: minor (deferred): receipt cleanup ignores delete responses and pagination
Task 14: minor (deferred, open flake): first stress run "Loading…" stalls in collection C3/C8b, discover 1 — no root cause; rerun green
Task 14: complete (commits 01429c0..419e33f, review clean); counts web 481, fn+rules 441, browser 50, stress 150/150
