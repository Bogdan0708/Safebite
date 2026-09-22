# Plan 3 execution ledger (subagent-driven development, 2026-09-22)

Copied verbatim from the git-ignored SDD workspace at completion so the rulings and the deferred-minor list survive for the final review, the owner and the external auditor. Branch range e34e1fa..898d2a8 (13 commits).

Spec: planning/specs/2026-09-20-safebite-pwa-design.md §3.6 (binding). Branch worktree-pwa-01-foundation, worktree /home/godja/Dev/AvaGF/.claude/worktrees/pwa-01-foundation. Plan commit e34e1fa.
Owner rulings before execution: subagent-driven; Plan 2b external review findings (planning/audits/2026-09-21-plan-2b-full-review.md, untracked) parked, not addressed in this run.

## Pre-flight scan (2026-09-22)
| Pair / task | Produces vs consumes | Found |
|---|---|---|
| T1 ↔ T7 | abortable(reason), anySignal, isTimeoutError | consistent |
| T2 ↔ T3/T4/T5 | DiscoveryResult, MAX_RESULTS 10, NEARBY_RADIUS_M 1500 | consistent |
| T3 ↔ T4 | ProviderError(kind, message, status); ProviderSelection | consistent |
| T4 ↔ T5 | selectProvider(secretValue, isEmulator) | consistent |
| T5 ↔ T6 | CONFIG_PATH "config/discovery"; seed writes same path; HTTP codes 400/429/503 per callable protocol | consistent |
| T6 root scripts | tooling/ensure-secret-local.mjs (new dir) | consistent |
| T7 ↔ T8 | useDiscoverySearch { state, submitDestination, submitNearby, fail(reason,label) }; SearchState shape in StateLine | consistent |
| T8 ↔ T9 | RestaurantPrefill (DiscoverPage.tsx), placeUrl (links.ts), router state { prefill } | consistent |
| T8/T9 ↔ T10 | testids discover-*, result-*, prefill-notice, prefill-duplicate, restaurant-maps; seedRestaurant googlePlaceId; getRestaurant | consistent |
| T1 self | existing AbortError tests vs reason-preserving abortable (jsdom sets AbortError reason) | consistent |
| T5 self | readConfig string cap → 0 → dailyCap test | consistent |
| T8 self | mocks: ./api via importOriginal, ../firebase, firebase/functions, repository, geolocation, AuthProvider | consistent |
| T10 self | scenario 2 state text contains query; scenario 8 no state line on results | consistent |
| Rubric vs mandates | no asserting-nothing tests, no verbatim logic duplication mandated (MAGIC literals duplicated in e2e by necessity: separate package) | none |
Scan clean; no rulings needed.

## Task log
Task 1: dispatched (base e34e1fa, implementer haiku)
Task 1: review 1 — 2 Important (abortable reasonOf overrides AbortError-named reasons; isTimeoutError widened to any .name===TimeoutError), fix round 1 dispatched (resume implementer)
Task 1: fix round 1/5 (0 addressed cleanly — fix commit 547bd12 matched the brief but left 6 tests red; commits 586b6c3..547bd12)
Task 1: Ruling: the brief's `err instanceof DOMException` checks in isAbortError/isTimeoutError are realm-fragile — verified 2026-09-22 in Vitest+jsdom: AbortController/AbortSignal are Node's (reason is Node's DOMException, `instanceof Error` true) while the global DOMException is jsdom's (`instanceof DOMException` false). Decision: both predicates become `err instanceof Error && err.name === "<Name>"` (DOMException inherits Error in every modern engine, Safari included); abortable passes `signal.reason` through exactly as the brief says. Why: the brief's code cannot pass its own tests here; name+Error is the cross-realm-safe form and keeps Task 7's contract. Cost if wrong: a non-DOMException Error deliberately named "AbortError" would be treated as an abort — no such object exists in this codebase. Round 2 amends 547bd12 (own unpushed commit) so no red commit stays in history.
Task 1: fix round 2/5 (fix amended into 4a22c2e; tests 183/183 green; implementer used `(err instanceof Error || (typeof err === "object" && err !== null)) && (err as any).name` — wider than the ruling)
Task 1: Ruling (amends the previous one): verified 2026-09-22 that `err instanceof Error && err.name === …` ALSO fails 2 tests — jsdom's own `new DOMException(...)` is not an instance of Node's global Error in this environment, so no instanceof check holds in both directions. Decision: predicates are `typeof err === "object" && err !== null && (err as { name?: unknown }).name === "<Name>"` (typed narrowing, no `any`; the `instanceof Error ||` clause is redundant since Error instances are objects). Why: only a structural check is realm-independent; DOMException.name is the spec-defined discriminator. Cost if wrong: any object literally named "AbortError"/"TimeoutError" counts — none exists here; the check runs only on rejections of our own abortable().
Task 1: fix round 3/5 (structural isNamedError, no any; amended into 1cf3da4; 183/183) — scoped re-review dispatched
Task 1: complete (commits e34e1fa..1cf3da4, review clean after 3 fix rounds; 2 rulings above)
Task 2: dispatched (base 1cf3da4, implementer haiku)
Task 2: complete (commits 1cf3da4..28e0346, review clean)
Task 3: dispatched (base 28e0346, implementer haiku)
Task 3: complete (commits 28e0346..c15c912, review clean)
Task 4: dispatched (base c15c912, implementer haiku)
Task 4: complete (commits c15c912..ac9b992, review clean)
Task 4: minor (deferred): googleProvider.ts — a non-string businessStatus is treated as absent (kept); comment-worthy only
Task 5: dispatched (base ac9b992, implementer sonnet)
Task 5: complete (commits ac9b992..91b485f, review clean; ⚠️ resolved: brief said 15 new tests, file defines 14 — brief arithmetic; callables.ts untested here — Task 6's HTTP tests cover it)
Task 5: minor (deferred): search.ts:80 logs err.message from Google unbounded — truncate or log status + fixed reason
Task 5: minor (deferred): no test asserts logs never contain the query text (capture logger)
Task 5: minor (deferred): "before touching config" test only checks usage absence, not the config read
Task 5: minor (deferred): kill-switch and cap refusals emit no log line; failure logs omit resultCount
Task 5: minor (deferred): index.ts re-export must stay after setGlobalOptions (onCall snapshots global options at module eval); no test pins region europe-west2
Task 5: note for Task 6: .gitignore must gain functions/.secret.local in the same change that creates the file (brief already mandates it)
Task 6: dispatched (base 91b485f, implementer sonnet)
Task 6: implementer DONE_WITH_CONCERNS — probe observed 400 FAILED_PRECONDITION 'Search is not configured.' (matches); concern: emu:test flaked 2/6 runs in discovery.search.test.ts with Firestore-emulator 'Request time should not be before the last token refill time' (emulator-internal, WSL2, back-to-back runs); final gate 246/246 — observation, carried to final review
Task 6: complete (commits 91b485f..84bedd7, review clean; ⚠️ MAGIC/CONFIG_PATH values resolved — Tasks 3/5 reviewed them)
Task 6: minor (deferred): monitor emu:test flake rate; discovery.callables.test.ts adds emulator traffic right before discovery.search.test.ts
Task 7: dispatched (base 84bedd7, implementer sonnet)
Task 7: implementer BLOCKED — two brief test defects (no commit yet)
Task 7: Ruling: api.test "declares the two callables by name" asserted module-load-time mock calls that Vitest's clearMocks wipes before the first test body (implementer verified empirically). Decision: the hoisted httpsCallable mock returns a function that echoes the callable's name, and the test invokes searchDestination/searchNearby and asserts the echoed name — same property (correct names bound), observable. Cost if wrong: none foreseen; it tests the same binding more directly.
Task 7: Ruling: search.test's local classifySearchError mock used `err instanceof DOMException`, which fails cross-realm (same defect as Task 1's ruling). Decision: the mock checks `(err as { name?: unknown })?.name === "TimeoutError"`. Implementation unchanged (uses the structural isTimeoutError). Cost if wrong: none; test-only.
Task 7: complete (commits 84bedd7..5cb1b84, review clean after 2 rulings)
Task 7: minor (deferred): api.test no longer asserts the callables bind to the app's `functions` instance (echo the first arg too)
Task 7: minor (deferred): "binds the two callables" test sits under describe("classifySearchError")
Task 7: minor (deferred): api.test timeout case is same-realm only
Task 7: minor (deferred): no hook test for unmount cancel() / StrictMode double mount
Task 7: minor (deferred): search.ts:347 isAbortError early return is defensive-only; comment which case it serves
Task 7: minor (deferred): hook creates controller during render (lazy ref) — documented pattern
Task 7: minor (deferred): hook captures `call` at first render only; undocumented
Task 8: dispatched (base 5cb1b84, implementer sonnet)
Task 8: complete (commits 5cb1b84..71e8d87, review clean)
Task 8: minor (deferred): existing-map rebuilt each render (no useMemo); no test for discover-locating / disabled Near me
Task 9: dispatched (base 71e8d87, implementer sonnet)
Task 9: fix round 1/5 (1 addressed: commit trailer was "Claude Sonnet 5" — amended message-only into a78185e; tree identical to 4f5f57f, verified by controller `git diff --stat` empty; re-review replaced by the direct trailer check since no code changed)
Task 9: complete (commits 71e8d87..a78185e, review clean)
Task 9: minor (deferred): readPrefill length branches for name/address not tested in isolation
Task 10: dispatched (base a78185e, implementer sonnet)
Task 10: complete (commits a78185e..fe117c6, review clean; full gate green: browser 23, stress 69/69, unit 234, functions 246, boot-guard 1, preview 4, upgrade 7; scenario 9 observed locationDenied)
Task 10: minor (deferred): scenario 7 fixed waitForTimeout(4_500) negative assertion; scenario 10 `rid!` from listRestaurantIds
All tasks complete. Final whole-branch review dispatched (opus) over e34e1fa..fe117c6.
Final review (opus, e34e1fa..fe117c6): With fixes. Critical 0. Important 4: (1) region/maxInstances rest on index.ts statement order, untested; (2) e2e getRestaurant drops doubleValue so the no-lat/lng assertion is vacuous; (3) CI timeout-minutes 25 not resized for 23 scenarios / 900 s globalTimeout, and emu:test has no retry despite the observed emulator flake; (4) search.ts logs Google's err.message unbounded and no test guards log content. Triage: T5-a, T5-b, T5-e, T6(CI half) → fix before merge; all other deferred minors stay deferred. Rulings judged sound.
Final fix wave: Ruling: include the reviewer's recommendation 3 (promote the storage/AIza/PLACES_API_KEY greps into ci.yml) in the wave — the plan's Global Constraints already treat those greps as gates, so enforcing them in CI is scope the plan implies; cost if wrong: a few CI lines. Ruling: functions vitest `retry` is CI-only (`process.env.CI ? 1 : 0`) so local runs keep surfacing the emulator flake; cost if wrong: a CI-only masked flake, still visible locally. Ruling: explicit `region: "europe-west2", maxInstances: 2` on both onCall options plus an endpoint unit test importing callables.ts directly (so the property holds without index.ts ordering); cost if wrong: none — global options still apply.
Final fix wave dispatched (base fe117c6, fixer sonnet).
Final fix wave: commits fe117c6..898d2a8 (9afda17 F1+F4, 898d2a8 F2+F3); gate typecheck, emu:test 256, unit 234, emu:e2e 23/23; deviation: key grep scoped ':!*.md' (AGENTS.md mentions GOOGLE_PLACES_API_KEY=) — accepted. Scoped re-review dispatched.
Final fix wave re-review: all 4 addressed, no new breakage. Plan 3 complete at 898d2a8 (13 commits e34e1fa..898d2a8).
