# Plan 5a persistence corrections — 2026-10-08

Base: `c673c5e1593f5e908f3075de95c96532cf857fdb`, branch
`worktree-pwa-05a-data-rights`. Local correction committed after the follow-up gate; no merge, push or deployment.

## Findings addressed

1. **P2: database-open timeout restarted Firebase with a deleted persisted user.**
   Before any destructive request, deletion now writes and verifies a durable cleanup intent
   for that request and UID. Startup checks those intents before importing Firebase. It removes
   only matching IndexedDB sessions transactionally; if opening/cleanup is unavailable, Auth
   starts in memory and never loads that stored user. The intent survives navigation, including
   when the late callback in the previous document was destroyed. Completion distinguishes
   failed local cleanup from the server-confirmed deletion. An older recovery request that
   cannot save its guard or clear persistence stays on a retry screen.
2. **P2: localStorage compare-then-remove erased a concurrent replacement login.**
   The application no longer uses, migrates, reads or removes Firebase's legacy localStorage
   Auth key. `initializeAuth` explicitly selects IndexedDB or memory. UID-conditional deletion
   remains a single IndexedDB readwrite transaction, which serializes with other tabs' writes.
   A still-open legacy tab's login is left alone.

The shared guard is separate from the deleted-UID notice record: a pending request is not proof
of deletion. Guards have per-request keys, so one refusal cannot erase another request's guard.
Enumeration snapshots key names before checking them, so concurrent removal cannot shift a
numeric index past another guard. A successful explicit sign-in forgets that UID's guards.
A definite server refusal forgets only its own request; an uncertain result keeps the guard.

## User-visible consequences

- A browser using only the old localStorage saved session must sign in again. Legacy Auth keys
  remain inert for the new application; this avoids deleting a replacement written by an older tab.
- When storage cannot be safely used, the sign-in screen says the session will not survive reload.
  Memory sessions are per tab; normal IndexedDB sessions remain shared between tabs.
- After an uncertain deletion, a reload in **any same-origin tab** can remove that UID's shared
  saved session and sign the account out in every tab observing that persistence, even if the
  server received nothing. **Continue** can therefore require signing in again. The receipt still
  decides the deletion outcome; the local marker does not prove deletion.
- If the durable intent cannot be saved before deletion, the destructive call is not sent.

## Permanent regression coverage

`web/e2e/auth-persistence.spec.ts` uses separate disposable emulator accounts named
`persistence-regression-departing@safebite.test` and
`persistence-regression-survivor@safebite.test`, under `demo-safebite`.

- Completion with 10-second and 1-second database-open delays makes no post-deletion Auth lookup
  for the deleted UID and preserves the replacement's current user, persistence and server data.
- Repeated startup timeouts select memory, including navigation and a late cleanup transaction
  after the replacement signs in. That replacement survives.
- With IndexedDB unavailable, a real SDK tab using legacy localStorage signs in a replacement
  concurrently with cleanup. The new app never accesses its Auth key, preserves the legacy
  session, and uses memory for its own sign-in.

Unit tests additionally cover incomplete cleanup reporting, guard-write refusal before the
server call, blocking legacy recovery when no safe reset is possible, startup gating, competing
request guards, and removal during guard enumeration. Existing browser scenario 4 now signs
back in after **Confirmation unavailable** before retrying deletion.

## Validation before the 2026-10-09 follow-up

The independently re-audited implementation passed (historical evidence; the follow-up below changes source):

| Check | Result |
|---|---|
| Root typecheck (Functions and web, including browser tests) | Clean |
| Web unit tests | 523/523 (52 files) |
| Functions and rules emulator tests | 441/441 (23 files; Functions/rules source unchanged) |
| Browser stress, retries disabled | 171/171: all 57 scenarios passed 3 times (15.3 minutes) |
| New persistence regressions within that stress run | All 4 passed 3/3 |
| Compile-only build and all three synthetic fixture builds | Passed |
| Built-app startup guard | 1/1 |
| PWA preview | 4/4 |
| Service-worker upgrade checks | 7/7 |
| Diff whitespace check | Clean |

Web source hashes were unchanged throughout the final stress run. Evidence directory:
`/tmp/safebite-persistence-fix-20261008/` (logs, source hashes, complete review patch and browser
results). The stress command used the repository's `demo-safebite` Auth/Firestore/Functions
emulators, `--repeat-each=3 --retries=0 --max-failures=1`, and a fresh local Vite server.
All emulators shut down successfully. These are local checks, not a deployment or hosted CI result.

A preliminary development run was invalidated by editing source while Vite was running.
Its trace contains both timestamped and unversioned imports of the Auth bootstrap module,
which left the dynamic-import harness using a different module instance. Logs and traces are
retained as `mixed-source-run.log` and `mixed-source-results/`; they are not final gate evidence.
A subsequent preliminary run passed the account scenarios but was intentionally stopped before
changing guard enumeration. The final gate uses frozen source and a fresh Vite process.

## Boundaries

No live-pilot account was read or changed. Existing suite operations involving
`ava@safebite.test` and `bogdan@safebite.test` also use disposable local emulator accounts.
Chromium checks do not replace real iPhone/Safari acceptance. The previously accepted SDK
polling window for an already-running deleted session remains; this correction does not replace
Firebase's internal synchronization. Provisioning order and Plan 5b device-store semantics remain
separate predeployment work. No account provisioner, Functions implementation or rules changed.


## Independent re-audit follow-up — 2026-10-09

The independent auditor confirmed both P2 fixes, with fresh typecheck, 523 unit tests and
57 browser scenarios passing. The medium startup-cost finding is addressed by checking all
marked UIDs in one IndexedDB open/readwrite transaction, not one open per UID. After verified
cleanup, bootstrap removes captured request and confirmed markers for confirmed-deleted UIDs.
Uncertain intents, markers after any unavailable result, and new request keys written during the
await remain. The bounded deleted-UID notice record stays. A confirmed result for another
currently signed-in account's deletion also records cleanup confirmation without a foreign notice.

Added unit coverage for 100 guarded UIDs, single-open/transaction behavior, transaction completion,
replacement preservation, unexpected persisted layouts, marker retirement and concurrent new
request keys. A permanent real-browser regression seeds 200 historical confirmed markers plus an
uncertain intent and verifies one cleanup open, retirement, and preservation of a different
account's real SDK sign-in.

Follow-up validation passed on the final behavioral source:

| Check | Result |
|---|---|
| Typecheck | Clean |
| Web unit tests | 529/529 |
| Functions/rules tests | 441/441 |
| Full browser suite, retries disabled | 58/58 (5.2 minutes) |
| Persistence regression repetitions, retries disabled | 15/15: all 5 cases passed 3 times |
| Compile-only and synthetic builds | Passed |
| Boot guard / PWA preview / upgrades | 1/1, 4/4, 7/7 |
| Staged whitespace check | Clean |

Evidence: `/tmp/safebite-marker-followup-20261009/`. Source remained frozen during the browser
runs. Afterward, a single trailing blank line was removed from the newly tracked config module;
rebuilt compile-only/synthetic JavaScript and other runtime assets are byte-identical to the tested
builds (only generated source-provenance JSON changes). The earlier 171/171 stress result above
belongs to the prior audited source; it is not claimed as a full stress run of this follow-up.

### Remaining low-priority follow-ups

These are tracked, not claimed fixed by this commit:

- **Cleanup retry screen (review #3):** add stable test IDs, prevent concurrent
  retries with a busy state, show repeated failure feedback, and cover the screen in a browser
  test. Account for the original durable request marker when a second confirmation-marker write
  fails, instead of considering only that second write.
- **Same-UID re-sign-in (review #4):** an uncertain deletion that did not happen can be followed
  by a successful same-UID sign-in after another tab snapshots guards. That tab may still delete
  the fresh saved session. No cross-UID data access results, but the account can be signed out.
- **Browser harness coupling (review #5):** direct dev-server source/prebundled SDK imports and
  success-only delayed-open stubs need maintenance when Vite/SDK behavior changes. Replace them
  with a stable test adapter and complete request-event forwarding when hardening the harness.
- **Development hot reload (review #6):** a second module instance can call `initializeAuth` with
  different options and throw. Development only; production builds load one module instance.
- **Plan 5b cleaner contract (review #6):** cleaners must preserve Auth cleanup intents and
  deleted-UID records. Add a regression when real device cleaners are registered, including a
  broad localStorage wipe attempt; it must not erase the startup guard.

The all-tabs effect of uncertain deletion (review #2) is now explicitly documented above and
in spec section 3.8. Existing provisioning-order and real-device acceptance requirements remain.
