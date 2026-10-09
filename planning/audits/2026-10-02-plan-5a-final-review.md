SafeBite Plan 5a final independent review — 2026-10-02

Verdict: changes required before merge. One reproducible P2 remains in completion.

Reviewed branch: worktree-pwa-05a-data-rights
HEAD: d1981afd106f072cf952c0984d060112cff11be3
Plan 5a base: ae13a205eec243a65fe7592dc029a3955c0d731b
Correction baseline: 4bde68e24b7a62d6c7ad86b44aebf18be014f141
Worktree: /home/godja/Dev/AvaGF/.claude/worktrees/pwa-05a-data-rights
The only difference between tested 419e33f and HEAD is the execution ledger.

F1 — P2: completion can sign out a different account through queued Auth changes

Source: web/src/account/deleteFlow.ts:68-78, especially signOut(auth) at line 73.

finishDeleted checks currentUser synchronously, writes an unscoped deleted notice,
then awaits signOut(auth). Firebase signOut is asynchronous and queues a null-user
update. A different account's cross-tab storage update can already be queued while
currentUser still refers to the deleted account. Both currentUser guards pass;
the queue then installs the other account before the completion sign-out removes
it. AuthProvider's reload on account change does not reliably prevent this.

Reproduction uses the unchanged app, real Firebase browser SDK, two same-origin
tabs and local Auth/Firestore/Functions emulators (demo-safebite). The test briefly
holds the SDK operations queue to make the interleaving deterministic; it does not
mock the deletion callable, replace signOut, or directly assign currentUser.

1. Ava submits deletion. The server completes; its HTTP response is held.
2. Hold the deletion tab's SDK queue; sign in as Bogdan in the other tab.
3. Bogdan's actual storage update queues while the first tab still reports Ava.
4. Deliver the completed deletion response. finishDeleted queues signOut after
   Bogdan's update because currentUser still passes its Ava check.
5. Release the queue. Bogdan is installed and then signed out. Both tabs end at
   sign-in, and the deletion tab displays the deleted notice.

Observed on all three executions (initial probe plus two zero-retry repetitions):
  queued bogdan-uid while current=ava-uid
  queued null while current=ava-uid
  other tab current UID: null (expected bogdan-uid)
  deletion tab deleted notice count: 1

The repeated probes independently confirmed the server-side boundary:
  Ava's password accepted: false
  Bogdan's password accepted: true
  household exists: true
This is an unintended session sign-out and account-ambiguous completion notice,
not evidence of deleting Bogdan's server account or household.

Control: the same queued account switch without completion's sign-out preserves
Bogdan's session. Both control repetitions passed. Thus the injected delay alone
does not cause the observed logout.

Required correction: coordinate completion with account changes through the actual
asynchronous Auth/persistence operation, rather than relying only on currentUser
checks before calling signOut. Keep the completion notice bound to the request's
account. Retain a real-SDK regression covering an already queued account switch;
the existing unit mocks cover switches during the callable and device cleanup,
but mock signOut and miss this interleaving. Re-review after the correction.

Evidence:
  signout-probe.log — first independent reproduction
  signout-recheck.log — 2 expected-preservation failures and 2 passing controls
  probes/signout.spec.cjs — reproducible test, including server preservation checks
  probes/playwright.config.cjs — isolated test configuration
  probe-results/ — browser traces, screenshots and error context

Original findings rechecked

- Deletion requests are now bound to expectedUid; the server rejects a mismatch
  with verified authentication before creating receipts or deleting data. Saved
  requests and recovery forms are bound to the original UID. The permanent
  Ava/Bogdan recovery scenario passes. The original wrong-account data deletion
  finding is addressed.
- Auth-only deletion now records dataDeleted before removing Auth. Older started
  receipts reconcile only when Auth, users/{uid}, and accountDeletions/{uid} are
  absent. Original retry/crash regressions pass, within the documented provisioned
  data invariant. The receipt findings are addressed.
- A missing receipt maps to Confirmation unavailable, not unfinished. Addressed.
- Recovery checks depend on request ID and UID, ignore superseded results, and
  render Finishing until completion returns. Those fixes are present, but they do
  not close the queued sign-out race described above.

Non-blocking UI observation

web/src/account/DeleteAccountPage.tsx:24-35 passes expectedUid correctly but does
not display the account email/name next to its destructive form. AppShell does
not display it either. The handoff's statement that every delete form names its
account is true of the internal UID binding, but not of every visible form.
Consider showing the email on this page as the recovery/pending screens do.

Independent validation on this exact tree

Typecheck: passed.
Web unit tests: 481/481 passed.
Functions and rules tests: 441/441 passed.
Standard browser suite: 50/50 passed, zero retries.
Compile build and synthetic preview/upgrade/boot bundles: passed.
Boot guard: 1/1 passed. Preview: 4/4 passed. Upgrade: 7/7 passed.
git diff --check: passed. Legacy Swift sources, Package.swift and AGENTS.md are
unchanged from the Plan 5a base.

The first sandboxed emulator launch could not bind its ports; the authorized
outside-sandbox local-emulator run passed. No live project was used for tests.
The 150-case stress suite was not repeated in this review. Its earlier reported
passing rerun is historical evidence; the prior Loading stalls remain unexplained.
No hosted CI, live pilot inventory, deployed TTL policy or real-iPhone acceptance
was independently verified in this review.

Remaining release/next-plan gates

- Provision users/{uid} before adding membership (or commit both atomically), so
  absence of the user document cannot hide a still-provisioned member from the
  Auth-only deletion path. The reported pilot inventory is not a provisioning fix.
- Before 5b persists household data, resolve cleanup-on-other-account semantics,
  cross-tab pendingClear races, stale clearFailed notices and failure behavior when
  localStorage is blocked but the actual data store remains available.
- Preserve rules/functions-before-hosting deployment order and verify receipt TTL,
  representative deployed deletion/export latency and real-iPhone acceptance.
- Commit-author privacy remains the owner's decision before publication.

Tracked source and Git refs were not changed. HEAD and worktree stayed clean.
Nothing was merged, pushed or deployed. The ignored .superpowers work folder was
left intact. All new audit probes and evidence are under /tmp/safebite-final-d1981af.
