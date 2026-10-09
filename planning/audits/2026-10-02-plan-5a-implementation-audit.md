SafeBite Plan 5a independent audit — 2026-10-02

Reviewed tree: 4bde68e24b7a62d6c7ad86b44aebf18be014f141
Branch: worktree-pwa-05a-data-rights
Base: ae13a205eec243a65fe7592dc029a3955c0d731b (24 commits)
Repository: /home/godja/Dev/AvaGF/.claude/worktrees/pwa-05a-data-rights
Audit artifacts: /tmp/safebite-5a-audit-u71qvi55

Verdict: changes required before merge or deployment.

This audit covers the 70-file Plan 5a diff, current rules and auth lifecycle,
spec section 3.8 including amendment 2ae1c9d, the implementation plan and
execution ledger, export, deletion/recovery, device cleanup, compatibility,
local gates and remote branch/CI status. No application or spec files were
edited. Test/build artifacts were regenerated. No Git ref, remote application,
live customer data, deployment, TTL policy, credentials or commit authorship
was changed. The ignored .superpowers work folder was retained as review evidence.

F1 — P1: deletion intent is not bound to its account

Relevant sources:
  web/src/account/DeletionRecoveryScreen.tsx:20-25,43-47
  web/src/account/storage.ts:19-20
  web/src/account/deleteFlow.ts:23-37

The persisted pending request contains only a request ID. The recovery check
returns a status without establishing whether the currently signed-in account
owns that request. For any unfinished receipt, the screen offers Finish deleting
and invokes the ordinary deletion form, which reauthenticates and deletes the
current account with a new request ID. Showing that account's email is disclosure,
not an identity check.

Reproducer: Ava's deletion has passed membership removal and then stopped.
Her old pending request ID remains in a tab. Bogdan signs in in another tab,
so that tab reloads with Bogdan current. Recovering Ava's request offers Finish
deleting for Bogdan. Submitting the fixture password sends deletion for Bogdan,
who is now the last household member. This can delete the remaining household
instead of finishing only Ava's departure.

The custom component/flow regressions also show a related gap: deleteMyAccount
reads auth.currentUser after awaiting reauthentication, so it does not establish
that the user being deleted is the one whose password was just checked.

Correction: bind the request and the visible destructive intent to the expected
UID; refuse recovery against a different current UID and require signing in as
the original account. Check identity across asynchronous reauthentication/token
boundaries and ensure the token used by the callable belongs to that identity.
The server must continue to derive authority from verified authentication, not
trust a client-supplied UID as authorization. Retain cross-tab and deferred-promise
regressions. Browser verification is recorded in browser-probe.log. The real
browser and Functions/Auth/Firestore emulators produced this result from the
seeded interrupted-request state (no mocked delete callable):
  recoveredRequestOwner=ava-uid
  avaStillExists=true
  bogdanStillExists=false
  householdStillExists=false
The expected preservation assertion failed in 9.3 seconds. The test restored
the synthetic accounts after capturing the result. No live account was used.

F2 — P2: some completed deletions cannot be confirmed by their receipts

Relevant sources:
  functions/src/account/deletion.ts:62,73,121-136
  functions/src/account/receipts.ts:78-91

dataDeleted is written only inside the record branch. The authOnly branch jumps
directly to Auth deletion while its receipt is still started. If Auth deletion
commits and the process/response fails before the final complete write, the
account is gone but checkReceipt returns started forever: it only reconciles
dataDeleted receipts. The UI then tells the user to sign in and finish an account
that cannot sign in. This path includes Delete this sign-in and retries after
steps 4/5 have removed the user and deletion record.

There is a second reproducible case: request A fails during its data sweep;
request B completes the same account deletion; request A's receipt remains
started even after Auth deletion. A tab holding request A cannot establish the
completed outcome. Sequential retry success does not prove every old receipt
can recover the result.

Isolated emulator evidence (receipt-probe-results.json):
  auth-only after committed Auth deletion + injected failure:
    authGone=true, receiptStatus=started
  normal member-path control under the same injected failure:
    authGone=true, receiptStatus=complete
  original interrupted request after a second request succeeds:
    authGone=true, oldReceipt=started, newReceipt=complete

Correction: durably record verified data-cleanup completion before Auth deletion
on every allowed starting path; make all outstanding receipts for an operation
able to reconcile its completion. Preserve the rule that Auth absence by itself
is not proof that custom data cleanup occurred. Inject failures between actual
writes and after Auth commit, not only before the coarse numbered steps.

F3 — P2: missing/expired receipt is incorrectly reported as unfinished

Relevant sources:
  web/src/account/recovery.ts:27-30
  web/src/account/DeletionRecoveryScreen.tsx:51-54
  functions/src/account/receipts.ts:81

A successful deletion whose browser lost the response can retain its pending
request ID while the app stays closed. After the seven-day receipt retention
and eventual TTL cleanup, the check returns none. recoveryView maps none to
"Your account deletion didn't finish. Sign in to finish it." The account may
already have been fully deleted. The same missing state also represents a
request that never arrived; those situations cannot be distinguished by absence.

Correction: represent none/expired as unknown or confirmation-expired, without
a definitive unfinished claim or a promise that sign-in can finish it. Adjust
the spec amendment and tests. A safe retry may be offered for a verified matching
existing account, but not as evidence of what happened to the earlier request.

Evidence: the custom pure-function regression expects uncertain for none and
fails with unfinishedSignedOut. Firestore documents asynchronous TTL cleanup,
typically within 24 hours after expiration:
https://firebase.google.com/docs/firestore/ttl

What was verified

- The earlier design-review issues concerning missing-parent recursive deletion,
  Admin discovery writes after membership removal, same-UID record recreation,
  conditional attribution updates, export authorship and snapshot membership,
  sharing from a fresh gesture, and reserved marker checks were addressed in code.
- The unreviewed 2ae1c9d amendment has a valid premise: the installed Auth SDK maps
  USER_NOT_FOUND on refresh to user-token-expired and can sign out the browser.
  Server-side receipt reconciliation is appropriate; F1-F3 still need correction.
- Export uses a single read-only transaction including membership and explicit
  output fields. Its file share/download is initiated by a separate user action.
- Last-member recursive deletion retries missing-parent trees and stamps completion
  only after deleteTree succeeds. Anonymisation uses conditional transactional
  reads, bounded chunks, an eight-worker pool and an orphan collection-state pass.
- Device cleaners have per-cleaner timeouts and a startup gate. No real cleaner
  is registered in 5a, so the known cross-tab marker race and stale clear-failure
  notice are dormant here. They remain hard prerequisites for 5b. Also do not
  assume blocked localStorage implies IndexedDB is unavailable: that needs a
  store-specific fail-closed contract before offline storage is introduced.
- Existing-code production-ID, discovery browser-storage and client API-key
  guardrails pass. Legacy Swift sources, Package.swift and AGENTS.md are unchanged.
- 9f82276..4bde68e changes only the execution ledger.

Rulings assessed

Per-call BulkWriter creation/close is a contained lifecycle choice; it does not
change deletion semantics. Lighter success logging is acceptable for this scope,
but the spec's stronger logging description should be aligned. The repaired
request-ID-before-send test now checks the captured value outside the swallowed
call error path and can fail. The email line alone does not solve F1. Historical
environmental flakes are not accepted as an explanation for the deterministic
custom failures in this audit. No commit email/history rewrite was performed.

Remote and release boundary

The GitHub connector independently confirmed main=ae13a20, a 404 for the named
Plan 5a branch and zero workflow runs for that branch. Shell network access failed,
so the connector was used for read-only verification. There is no hosted CI
evidence for this unpushed tree. Live staging and real-iPhone acceptance were not
exercised; no live destructive checks were attempted.

Deployment still requires rules/functions before hosting and enabling/verifying
the receipt TTL policy on the pilot. maxInstances=2/concurrency=1 limits simultaneous
anonymous receipt checks; it is not a daily spend cap. Keep that endpoint on the
5c operations checklist.

Validation results are recorded in status.txt and individual *.log files.
Custom expected-to-fail regressions are separate from the unchanged repository
gate. See web-probes.log, browser-probe.log and receipt-probe-results.json.

Final validation on 4bde68e

  Typecheck: pass.
  Web unit: 452/452 pass.
  Functions and Firestore rules: 427/427 pass.
  Browser: 49/49 pass.
  Browser stress: 147/147 pass, three repetitions, zero retries (10.0 minutes).
  Compile build and three synthetic bundles: pass.
  Preview: 4/4 pass.
  Upgrade: 7/7 pass.
  Build refusal: missing config, non-production mode, fixture override all refused
    for the intended reason (build-guard-results.json).
  Boot guard: initial configured 120-second gate timed out during plugin setup,
    before scenario execution. A 30-second debug probe reproduced the stall.
    The unchanged scenario passed on the original port with a 240-second overall
    allowance. Debug evidence shows the first HTTP availability check to closed
    127.0.0.1:4173 stalled for about 135 seconds before ETIMEDOUT; the server then
    started and the actual scenario passed in 532 ms. Direct bounded TCP probes
    likewise timed out on 4173/4174, while 5173 immediately returned ECONNREFUSED.
    This establishes a local port/setup problem for this run; it is not evidence
    that all historical flakes were environmental. See boot-guard-recheck.log.

New audit regressions: three deterministic client/unit failures and one browser
failure establish F1/F3; two emulator fault scenarios plus a passing control
establish F2. These are product findings despite the normal suites being green.

Final git status: clean, HEAD unchanged. No audit artifact was added to the branch.

Minor follow-ups (not additional merge blockers)

- README's reported 450 web / 421 Functions tests is stale; final counts are 452/427.
- Align spec logging language with the approved lighter success-only logging.
- Use a monotonic clock for the large-household performance test: Date.now() can
  jump backwards on this host and make elapsed-time assertions misleading.
- The local 300-restaurant benchmark is not proof of the deployed 60-second limit
  under production latency or arbitrarily large datasets. Keep representative
  staging acceptance and export-size/latency checks in the release work.

Next action: keep the branch unmerged; correct F1-F3 and their spec/plan contracts,
add permanent regressions for the demonstrated states, then re-audit the fixes.
