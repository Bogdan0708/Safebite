# Plan 4 execution ledger

Copied from the git-ignored SDD workspace at completion so rulings, deferred minors and gate evidence survive for the owner and the external auditor. Branch range 4052c36..88b8d14.

# SDD ledger — plan: planning/plans/2026-09-24-safebite-pwa-04-collection.md

Spec: planning/specs/2026-09-20-safebite-pwa-design.md §3.7 (amended f8edfc9). Branch worktree-pwa-04-collection, start 4052c36.
Models: implementers sonnet (plans carry full code but edit existing files across several places), task reviewers sonnet, final review opus.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1↔T2 firestore.rules | T1 adds callerName/notes/collection; T2 rewrites restaurant create/update/delete | Disjoint regions; T2's delete gate reads collection/{rid} that T1 defines. OK |
| T1↔T3 | LIMITS.note (T1) → validateNoteText (T3) | OK |
| T2↔T3 repository exports | write, ConflictError, NotFoundError, LISTEN, listenerFailure, toDate, restaurantRef, notesCol, collectionRef → collection.ts / notes.ts | Names match. OK |
| T2↔T4/T5 messages.ts(+test) | deleteProgressText (T2) → pages; T4 appends finishOutcomeText; T5 appends statusOutcomeMessage | Appends only; T2 creates messages.test.ts, T4/T5 append. OK |
| T2↔T4 RestaurantsPage.tsx | T2 swaps STEP_TEXT for deleteProgressText; T4 replaces the file (still uses deleteProgressText) | OK |
| T2↔T6 RestaurantFormPage.tsx | T2 progress text; T6 confirm text + outcome verb | Disjoint. OK |
| T3↔T4/T5/T6 | CollectionState, Note, setShortlisted/setVisited/watch*, add/update/deleteNote signatures | Match (checked arg order hid,rid,author,base,value / hid,rid,nid,base,text). OK |
| T4↔T5↔T6 combine.ts | isData/anyOffline/combineStates (T4) → StatusBlock, detail page, NotesSection | OK |
| T5↔T6 RestaurantDetailPage(+test) | T5 adds stateWatch, anyOffline(rs,cs,ss), StatusBlock; T6 adds notesWatch into anyOffline, NotesSection | Sequential edits of same lines, instructions compatible. OK |
| T4↔T6 styles.css | both append | OK |
| T4↔T9 web/e2e | T4 edits records.spec (filter-all); T9 edits emulator-rest + new spec | Disjoint. OK |
| T7↔T10 | resetting / per-tab reset → cross-tab e2e | OK; T7 changes sign-out to a reload, existing e2e waits on signin-form → still valid |
| T8↔T10 | pw-* testids → e2e | OK |
| T9↔T10 emulator-rest | seedNote/seedRestaurant/clearRecords (T9) → auth.spec (T10) | T10 depends on T9 order. OK |
| T1 self | tests vs rules | Consistent |
| T2 self | Step 3 "expected fail" wording approximate (replaced delete test passes on old rules) | Harmless |
| T3 self | counts 8 collection + 6 notes + 2 validation | Consistent |
| T4 self | existing page tests need filter-all + collection mock; e2e scenarios 1,7 | Covered in steps |
| T5 self | date inputs via fireEvent (jsdom sanitising) | Consistent |
| T6 self | counter 21/2000 | Consistent |
| T7 self | two existing AuthProvider tests rewritten | Consistent |
| T8 self | 15 + 4 + 1 tests | Consistent |
| T9/T10 self | 29 → 36 → 38 scenarios; globalTimeout 1.2M | Consistent |

Ruling: keep functions/test/rules.deletion.test.ts's `newFinish` as a mirror of repository.finishDeleting (logic duplicated across packages) — the rules test cannot import web code and the real client is covered by e2e C5 — cost if wrong: the mirror drifts from the repository unnoticed; mitigated by its "keep in step" comment and C5.
Ruling: accept duplicated firestore vi.mock blocks across repository/collection/notes tests — per-file vi.mock factories cannot be shared without hoisting tricks; test scaffolding only — cost if wrong: minor maintenance.
Ruling: toggle-conflict browser test replaced by unit/component proof + note-conflict e2e (plan self-review deviation, flagged to owner) — cost if wrong: one additional e2e scenario later.

## Progress
Task 1: dispatched (base 4052c36, implementer a38cc9e41dd289c06, sonnet)
Task 1: minor (deferred): firestore.rules callerName() duplicates claims' callerDisplayName() (plan-mandated); consolidate later
Task 1: complete (commits 4052c36..d726498, review clean) — note: worktree had no node_modules; implementer ran npm install in root/functions/web (lockfile untouched)
Task 2: dispatched (base d726498)
Task 2: minor (deferred): rules.deletion.test NEW_STEPS mirrors repository by hand (plan-mandated; see preflight ruling)
Task 2: minor (deferred): race test's orphan assertion is conditional on timing (if !after.restaurant)
Task 2: minor (deferred): memoryFirestore tx.update creates missing docs (real Firestore fails); memoryPage default 100 duplicates SWEEP_PAGE
Task 2: minor (deferred): markCleanupDone notFound on a live restaurant would read "Already removed." (unreachable via finishDeleting)
Task 2: complete (commits d726498..ebf581f, review clean) — counts: unit 276, functions+rules 352, browser 29
Task 3: dispatched (base ebf581f)
Task 3: ⚠️ resolved — deleteNote skips parent check: spec §3.7 lets the author delete any time; compliant
Task 3: minor (deferred): comment the asymmetry (deletes don't gate on restaurant state)
Task 3: complete (commits ebf581f..09b4594, review clean) — unit 292
Task 4: dispatched (base 09b4594)
Task 4: observation — discover.spec.ts scenario 7 (supersede slower search) failed 2/3 full e2e runs (~24 s function time), passed 3rd; untouched code; watch in final stress run
Task 4: ⚠️ resolved — anyOffline unused until Tasks 5–6 (planned consumers); discover flake tracked above
Task 4: complete (commits 09b4594..7e9cabe, review clean) — unit 305, browser 29
Task 5: dispatched (base 7e9cabe)
Ruling: Task 5 commit 1e5bc05 trailer names Claude Sonnet 5 (the implementing model, per its harness attribution reminder) instead of the plan's Opus line — accepted, no history rewrite; trailers may differ per task — cost if wrong: cosmetic trailer inconsistency, fixable by the owner at squash time
Task 5: minor (deferred): "On shortlist · Remove" rendered as separate span+button without a literal middot (cosmetic)
Task 5: complete (commits 7e9cabe..1e5bc05, review clean) — unit 317
Task 6: dispatched (base 1e5bc05)
Task 6: observation — e2e 4 runs: discover#7 flake, plus two one-off 'signin-form not visible within 5s on page load' timeouts (auth.spec, records#6); run 4 clean 29/29; machine idle (load <1.5) — quantify in final stress run
Task 6: minor (deferred): NotesSection.tsx comment says the confirmation reset "mirrors ClaimCard" — ClaimCard resets by key remount; wording inaccurate
Task 6: complete (commits 1e5bc05..21bf09e, review clean) — unit 329, browser 29 (after re-runs; flakes tracked)
Task 7: dispatched (base 21bf09e)
Task 7: ⚠️ resolved — signOutAndWait with reload verified by the implementer's 29/29 e2e first run
Task 7: minor (deferred): AuthProvider reset predicate vs !user branch readability
Task 7: complete (commits 21bf09e..f8a9dcf, review clean) — unit 332
Task 8: dispatched (base f8a9dcf)
Task 8: minor (deferred): offline message literal duplicated a third time (changePassword.ts; also messages.ts, DiscoverPage.tsx)
Task 8: complete (commits f8a9dcf..31f3aca, review clean) — unit 352
Task 9: dispatched (base 31f3aca)
Task 9: complete (commits 31f3aca..70a78b2, review clean) — browser 36, stress 108/108
Task 10: dispatched (base 70a78b2)
Ruling: Task 10 guardrail grep hit on `resetDocument` is a substring false positive; word-bounded grep (-w) is clean — no rename — cost if wrong: none (verified no Firestore write API in web/src).
Task 10: observation — stress 113/114, discover.spec.ts scenario 7 failed once (third sighting this plan: T4, T6, T10); passes single-pass; flag to final review/owner as a timing-sensitive test
Task 10: complete (commits 70a78b2..3dec446, review clean) — unit 352, functions+rules 352, browser 38, stress 113/114 (discover#7), boot-guard/preview/upgrade 1/4/7
Final review: With fixes — 1 Important (discover#7 wait budget), 5 Minor; fix wave dispatched (base 3dec446)
Final fix wave: commits 3dec446..88b8d14 — all 6 findings ADDRESSED (re-review), no new breakage. Gate: typecheck clean; unit 354; functions+rules 352; browser 38; stress 114/114.
Final: deferred (out of scope, residual): auth.spec.ts:70 inline signin-form wait after page.reload() still on the 5 s default.
Final: deferred minors kept per final-review triage: T1 callerName dup, T2 memoryFirestore update/SWEEP_PAGE, T2 markCleanupDone wording, T3 delete-asymmetry comment, T5 middot, T6 NotesSection comment, T7 predicate readability, T8 offline string dup.
