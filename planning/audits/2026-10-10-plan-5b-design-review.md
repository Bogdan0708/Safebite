# Plan 5b design review — 2026-10-10

Reviewer: independent (Claude Fable), against b204593.

Reviewed: `planning/specs/2026-09-20-safebite-pwa-design.md` §3.9 (lines 1711–1956) against the code on `worktree-pwa-05b-offline`. SDK behaviour was checked in the installed packages (`@firebase/auth` 1.13.6, `@firebase/firestore` 4.17.2, `firebase` 12.19.0; the 5b worktree has no `node_modules`, so the files cited below are under `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-05a-data-rights/web/node_modules/`, same lockfile versions). No repository files were changed; nothing was run against emulators or the network.

## Verdict

**Changes requested before the implementation plan.** The architecture (IndexedDB copy tagged by uid+household, epoch-guarded replace, cleaner registered with the 5a registry, `offlineMember` as a separate auth state) is sound and the cross-tab and isolation reasoning mostly holds. But the spec as written permits an implementation in which a refresh triggered while the client is offline replaces the copy with the Firestore memory cache's partial contents (P1), the copy is never consulted in the owner's main use case (app already open when the signal drops), the start-up budget ignores the Auth SDK's own network wait, a household move leaves the old household readable offline for 30 days, the cleaner's registration can silently break the 5a persistence gate, and three of the eight browser tests cannot run on the current harness. All are spec-level amendments; none needs a new brainstorm.

## Findings

### P1-1 — Refresh reads are not pinned to the server; `getDocs` offline resolves from the memory cache and the refresh would overwrite the copy with it

**Spec:** §3.9 lines 1830–1832 ("Read from the server: the restaurants query, then for each restaurant its claims and notes … Any other failure ends the refresh with nothing written") and 1811–1813 ("only … a refresh whose server reads all succeeded (they prove membership too)"). Also 1800–1802 ("persistence is off, so `getDoc` cannot answer from a disk cache").

**Code:** `getDocs` and `getDoc` with the default source resolve cached data when the client is offline: `common-CLMydGSF.esm.js:26727` rejects only when `source === "server"`, otherwise `s.resolve(r)` with `fromCache: true`; `:26690` rejects `getDoc` only for a document *absent* from the cache. The default cache is memory with eager GC (`:26069`), so whatever is held by active listeners (`repository.ts:112–118`, `:121–134`) *is* served from cache. The repository already imports `getDocsFromServer` (`repository.ts:5`) but the spec never names it.

**Scenario:** member, opted in, app open on `/restaurants/r1` (listeners hold one restaurant, its claims, its notes). Signal drops; `navigator.onLine` stays true (cellular with no data). The 15-minute timer or `visibilitychange` trigger (1837–1839) fires. `getDocs(restaurants)` resolves `fromCache` with 0 or 1 documents and no error; claims/notes/collection likewise. Step 3's guards (epoch, opt-in, meta identity) all pass. The copy is replaced by a one-restaurant copy with `complete: true` and `membershipCheckedAt = now` — the 30 days are renewed from cache, and the full copy is destroyed exactly when it is about to be needed. The spec's "Any other failure ends the refresh" does not apply because nothing failed.

**Amendment:** Define "server read" operationally: every read in a refresh uses `getDocsFromServer`, the membership read in `stateForUser` uses `getDocFromServer`, and the refresher additionally refuses to write if any snapshot has `metadata.fromCache === true` (belt and braces; `getDocsFromServer` already rejects with `unavailable`). Add to the unit tests: a refresh whose mocked query resolves `fromCache` writes nothing and reports "offline". Also reword 1800–1802: the memory cache *can* answer `getDoc` for a document held by a live listener; the server pin, not persistence-off, is what makes the check a server check.

### P2-2 — The copy is only used after a cold start; the running app never reads it

**Spec:** 1791–1795 ("a copy-backed variant selected while the state is `offlineMember`"), 1724–1725 (use cases: "no signal in or near a restaurant"), 1717–1718 ("a readable, recent copy is already on the device when the connection drops unexpectedly").

**Code:** In `member`, listeners deliver `fromCache` snapshots from the memory cache (`repository.ts:116`, `:128`). Eager GC drops documents whose targets were released, so after navigating away from the list, a detail page not previously opened emits "You are offline and this restaurant has not been loaded on this device" (`repository.ts:128`). Nothing in the design consults the copy here.

**Scenario:** The user plans at home (app open, member), walks to the restaurant, loses signal, opens a different record to check the fryer evidence → "not loaded on this device". The copy is complete and 10 minutes old, but the only way to reach it is to force-quit the Home Screen app and reopen it (there is no reload control in standalone mode). This is the owner's primary use case and the design does not meet it.

**Amendment:** Select the copy-backed read by *snapshot provenance*, not by auth state: in `member`, when a listener delivers a `fromCache` snapshot (or an error with `unavailable`) and a complete copy tagged for this uid/household exists, the watcher emits `{ status: "offline", value: <copy> }` for that query instead of the cache contents; a non-cache snapshot always wins and the next server snapshot replaces the copy value. `offlineMember` then becomes the special case where *no* Firestore listener is created. State the rule in §3.9: "the UI shows the server or the copy, never the memory cache, whenever a copy exists." Browser test 1 gains a sibling: open a record, `context.setOffline(true)`, navigate to a record not yet opened → readable from the copy.

### P2-3 — The start-up budget ignores the Auth SDK's own network wait before `onAuthStateChanged` fires

**Spec:** 1814–1815 ("give the membership read up to 6 s"), empirical stop 1 (1899–1901, measures only `getDoc`).

**Code:** Auth initialisation reloads the stored user over the network before any listener fires: `index-4NFEPWkC.js:2874–2886` (`reloadAndSetCurrentUserOrClear`). The request's timeout is `DEFAULT_API_TIMEOUT_MS = Delay(30000, 60000)` (`:881`); `Delay.get()` (`:652–661`) returns **5 s when `navigator.onLine === false`** and **30 s otherwise** (`isMobile` is Cordova/React-Native only, so an iPhone browser gets 30 s). On timeout the error is `network-request-failed` (`:1036–1040`), which keeps the user (`:2878–2883`).

**Scenario:** Airplane mode: fetch usually fails immediately, so this is fine. "No signal near a restaurant" (connected, no throughput, `onLine === true`): `getAccountInfo` hangs for up to 30 s before `onAuthStateChanged` fires; only then does the 6 s membership budget start. The user sees "Preparing sign-in…"/"Loading…" for ~36 s and nothing explains it. Stop 1 as written would not detect this because it measures `getDoc` only.

**Amendment:** Extend stop 1/2 to measure time-to-first-`onAuthStateChanged` in (a) airplane mode and (b) a stalled connection (Playwright `page.route` that never fulfils the identitytoolkit request; Chrome DevTools "offline" does not reproduce a stall). Record both numbers in the plan and state the user-visible waiting copy for that window. Decide (owner question 3) whether a stall of that length is acceptable or whether 5b should render `offlineMember` early from the persisted uid in `firebaseLocalStorageDb` (5a already opens it: `persistedSession.ts:48–76`, layout pinned to 1.13.6) and reconcile when Auth resolves. The early-render option is a real design change and must not be slipped into the plan without the ruling.

### P2-4 — A member moved to another household keeps the old household's copy readable offline for 30 days, and the refresh wedges

**Spec:** 1806 (server "member" → `recordMembershipCheck` for this uid/householdId, start refresh), 1808 (no answer + `meta` matches `uid` → `offlineMember`, with `householdId` from meta), 1833–1835 (step 3 aborts if "`meta` names another account or household"), 1732–1734 (ruling 5: "The first server answer confirming loss of access wipes it").

**Scenario:** The owner moves Ava's `users/{uid}.householdId` from household H1 to H2 (admin-written, `firestore.rules:115–118`). Ava's device has a complete H1 copy. Online: `stateForUser` answers "member of H2"; `recordMembershipCheck(uid, H2)` either renews `meta` (tagged H1) or is a no-op; the refresh captures `householdId = H2`, reads H2 from the server, then step 3 sees `meta.householdId === H1 ≠ H2` and aborts — every refresh fails from now on ("Last update failed" forever). Offline start: row 3 checks only `meta.uid`, so Ava gets `offlineMember { householdId: H1 }` and reads H1's restaurants and the other H1 member's notes for up to 30 days. No server answer ever "confirms loss of access" because the answer is "member".

**Amendment:** In the `member` row: if a copy exists and `meta.householdId !== householdId`, run `clearCopy()` before `recordMembershipCheck` and the refresh. `recordMembershipCheck(uid, hid, now)` must be a conditional update that writes only when `meta` exists and matches both ids, and never creates `meta`. Add to the unit tests: "server member of a different household → copy cleared, then replaced".

### P2-5 — Cleaner registration can either miss the start-up clear or break the 5a persistence gate, depending on import order

**Spec:** 1785–1787 ("Registers a device cleaner named `offlineCopy` with the §3.8 registry") — unspecified where/when.

**Code:** `main.tsx:1` imports `./device/registerCleaners` first; `main.tsx:49` runs `pendingClear()` → `DeviceClearingScreen` → `clearDeviceData()`, which succeeds vacuously when no cleaner is registered (`cleanup.ts:55–69`, `failed.length === 0` → marker removed). `registerCleaners.ts` is empty (`:1–6`). Separately, `firebase.ts:21–23` evaluates `initializeAuth(app, { persistence: persistentAuthAllowed() ? indexedDBLocalPersistence : inMemoryPersistence })` at module load, and `main.tsx:36` only imports `./App` after `prepareAuthPersistence()` resolves.

**Scenarios:** (a) The cleaner is registered from `store.ts` and `store.ts` is first imported by the App chunk (e.g. from `AuthProvider` or Settings): the marker-set start-up runs zero cleaners, removes the marker, and the previous account's copy survives into the next session; `readCopy` refuses a uid mismatch so it is not exposed, but §3.8's contract ("no stored copy is readable while the marker is set", 1391) is violated and the copy is never cleared. (b) `registerCleaners.ts` imports `store.ts`, which imports anything that imports `firebase.ts` (`refresher.ts`, the repository): Auth initialises with `allowed === false` → memory-only Auth for every start → sign-in never persists → `offlineMember` is unreachable, and the sign-in screen shows the memory-only notice (`SignInScreen.tsx:56`) on every device.

**Amendment:** Specify: `offline/store.ts` is IndexedDB-only and imports nothing from `firebase/*` or `../firebase`; the cleaner is registered in `device/registerCleaners.ts` by a static import of `store.ts`. Add two permanent tests: (1) importing `device/registerCleaners` with `../firebase` mocked to throw does not throw (module-graph guard); (2) start-up with the marker set and a seeded copy clears the copy before `onCleared`.

### P2-6 — Browser tests 1, 4 and 5 cannot run on the emulator harness as written

**Spec:** 1921–1926 ("browser offline → reload → …", "revoked … while offline → reconnect", "clock faked").

**Code:** The e2e suite runs the Vite dev server (`playwright.config.ts:22–27`); the service worker exists only in built bundles (`vite.config.ts:87–88`, `registerServiceWorker` gated on `__SAFEBITE_BUILD__` in `serviceWorker.ts:64`). `context.setOffline(true)` then `reload` fails to load the shell at all. The preview suite has the worker but "No emulators, no network beyond 127.0.0.1" (`playwright.preview.config.ts:6–8`).

**Amendment:** Specify the mechanism per scenario: for "offline reload", keep the dev server reachable and abort only the emulator origins with `page.route` (`127.0.0.1:8080`, `:9099`, `:5001`); note that `navigator.onLine` stays true, so this exercises the 6 s path and the Auth 30 s path (P2-3) — the scenario's timeout must allow for it, or the test also stubs `navigator.onLine` via `addInitScript`. Use `context.setOffline(true)` without reload for the in-place scenarios (P2-2's sibling, test 8). Test 5 uses `page.clock`. Test 3 (refresh paused between steps 2 and 3) needs an injectable pause hook on the refresher, as 5a's runner had; name it in the plan.

### P3-7 — A late membership answer after the 6 s timeout is unspecified

**Spec:** 1814–1815, 1820–1823 (only `online` and the 15-minute retry leave `offlineMember`).

**Scenario:** `getDocFromServer` resolves "not a member" at 8 s. The state is already `offlineMember`; the answer is discarded and a revoked member keeps reading until the next retry (up to 15 minutes) — contradicting ruling 5's "first server answer". Conversely a late "member" answer is wasted.

**Amendment:** The timed-out read is not cancelled; its eventual result is applied with the same classification (member → switch in place; loss → wipe), guarded by the generation counter already in `AuthProvider.tsx:75–90`.

### P3-8 — The per-run clear token needs a concrete scheme; a token *value* under one key still masks a failure

**Spec:** 1888–1889, 1949–1950.

**Scenario (single key, token value):** run A writes `tA`; run B writes `tB`; A fails (writes nothing); B succeeds and removes the key. A's failure is masked — the exact 5a defect.

**Amendment:** One key per run, `safebite.pendingClear.<token>` (as `authCleanupGuard.ts` does for intents), set before cleaners run and removed only by its own run on success; `pendingClear()` is true if any such key or the legacy `safebite.pendingClear === "1"` exists; the start-up screen runs the cleaners and removes every key on success. The stale-notice removal (1890–1891) follows from "no key present".

### P3-9 — Read-source wiring is under-specified in five places

**Spec:** 1791–1795, 1869–1874.

- `useMember()` throws unless `status === "member"` (`useMember.ts:6`); every page calls it. `offlineMember` must be accepted there and in `App.tsx:13–32`'s gate, which currently has no such case.
- The watchers are plain functions (`repository.ts:112`, `collection.ts:27`, `notes.ts:24`, also used by `DiscoverPage.tsx:71`); they cannot "select a variant while the state is `offlineMember`" without a parameter or a module-level switch. With P2-2 the selection becomes snapshot-driven, which resolves this; say so.
- Copy-backed watchers emitting `offline` make every page render `ReadStateNotice`'s "Showing last loaded data — you are offline" (`ReadStateNotice.tsx:13–16`) *in addition to* the shell banner (1869–1871). Decide which one shows.
- `RestaurantsPage.tsx:75–78` renders empty states only from `ready`; an empty copy shows a bare list with no text. Add "Nothing in the offline copy" or accept and state it.
- `SettingsPage.tsx:24–33` calls `whoami` on mount; in `offlineMember` the Offline-copy section would sit under "Could not confirm membership with the server." Suppress or reword while offline.
- Switching `offlineMember → member` in place unsubscribes the copy watchers and starts Firestore listeners in `loading` (`useWatch.ts:15–17`): the copy's content is replaced by "Loading…" until the first server snapshot. Keep the last copy value during that transition, or accept the flash.
- Whether a copy-backed subscription is one-shot or re-reads after a refresh in another tab is not stated; one-shot plus re-read on the state transition is enough.

### P3-10 — Refresh cost: the trigger list forces a full N+1 re-read after every note edit and every 15 minutes

**Spec:** 1830–1831, 1837–1840, 1944.

**Code:** Reads are allowed per path only (`firestore.rules:138`, `:179`, `:202`, `:252`); there is no collection-group rule, so claims and notes need one query per restaurant (do not add `match /{path=**}/claims` — it widens the read surface). A refresh is `1 + 2N + 1` queries and roughly `N + claims + notes + collection` billed reads; for N = 100 with ~5 claims and ~2 notes each, ~900 reads per refresh, up to 4 per hour while visible plus one per successful write, per device. That is within the free tier for two members but is the largest read source in the app; 5c's cost checklist should carry the number.

**Amendment:** Keep the full refresh for enter-member, opt-in, `online`, and **Refresh now**. For "after any successful write", refresh only the written restaurant's sub-stores (the write already knows `rid`), and coalesce the 15-minute timer with the listener state: skip when every live listener has reported a non-cache snapshot since the last download (the data is already current). Record the per-refresh read count in the plan's empirical results.

### P3-11 — Opt-in, sign-out and the §3.8 "per-UID cleanup" sentence disagree

**Spec:** 1727–1728 (ruling 2: "Opt in once per account on each device"), 1785–1787 (the cleaner "deletes all `optIn` rows"), 1842–1843 (sign-out runs `clearCopy()`, which leaves `optIn` alone), §3.8:1452–1454 ("5b's per-UID cleanup removes the deleted UID's copy"), 1941 (one copy per device).

**Code:** `AuthProvider.tsx:98–104` runs `clearDeviceData()` — hence the cleaner — on every sign-out and switch.

**Issue:** Every sign-out deletes `optIn`, so "once per account on each device" is in practice "once per sign-in". Deleting it is the privacy-correct choice (a uid list left after sign-out is residue), but the ruling should be restated. §3.8's "per-UID cleanup" does not exist in the one-copy model; the account-change clear covers it. Also: when `persistentAuthAllowed()` is false (memory-only Auth), a copy can never be opened offline (no user after reload); the switch should be disabled with the memory-only explanation.

**Amendment:** Restate ruling 2 ("after each sign-in"), amend §3.8:1452–1454 to reference the one-copy model and the account-change clear, and disable the switch under memory-only Auth.

### P3-12 — Storage durability: Safari's 7-day eviction for non-installed sites is not mentioned

**Spec:** 1848–1850, stop 3 (1905–1906).

Safari (ITP) deletes script-writable storage, IndexedDB included, after 7 days without interaction for sites opened in the browser tab; Home Screen apps are exempt. The Firebase Auth session is in the same IndexedDB, so a Safari-tab user loses both. Add to stop 3: test the Safari-tab case and the installed case separately, and let the Settings copy say that the copy is reliable only in the installed app. `persist()` returning `false` or being undefined on iOS is already covered by the "not stored as a guarantee" wording.

### P3-13 — Store contract tightenings

**Spec:** 1781–1787, 1833–1836, 1842–1846.

- `clearCopy()`: state explicitly that the epoch bump and the deletes are **one** readwrite transaction over `control`, `meta` and the record stores (the "in its own transaction" wording at 1843 is ambiguous), and that the refresh's step-3 transaction includes `control` in its scope — serialisation only holds for overlapping scopes.
- Compare the epoch by **equality**, not "increased": a browser-evicted or user-cleared database comes back with no `control` row, so "only ever increases" (1769, 1846) is not true across eviction; equality still aborts correctly.
- Open a connection per operation and close on `versionchange`; a long-lived connection in a background tab will block any future version bump.
- Step 3 aborting on `QuotaExceededError` leaves the previous copy intact (IndexedDB rolls the transaction back) — state this, since 1880–1881 only says "treated as a failed refresh".
- `meta.complete` is written last in the same transaction (it is, per 1836); keep it that way and never write a partial `meta`.

### P3-14 — Test tooling gaps

**Spec:** 1912–1917, stops 4 and the browser list.

`package.json` has no `fake-indexeddb` and jsdom has no IndexedDB; the store unit tests need it as a dev dependency (or run as browser tests). Stop 4 and browser test 3 need a harness page like `e2e/auth-harness.html` and a refresher pause hook (P2-6). Say so in the plan so the first task does not stall on tooling.

## Verified as sound

- **Stored sign-in restores offline (stop 2).** `reloadAndSetCurrentUserOrClear` keeps the user only on `auth/network-request-failed` (`index-4NFEPWkC.js:2874–2886`); fetch failures (`:932–985`, non-`FirebaseError` → `network-request-failed`) and the request timeout (`:1026–1040`) both map to that code, so an expired token offline does not sign the user out. `_logoutIfInvalidated` (`:1337–1350`) signs out only on `user-disabled`/`user-token-expired`.
- **Start-up ordering matches the code.** `main.tsx:1,36,49` → `prepareAuthPersistence` → `firebase.ts:21–23` → `AuthProvider.tsx:47` (deleted-session check before any read) → membership. The 5a gate is untouched by the design, subject to P2-5.
- **Remote deletion while offline, on reconnect.** Production token refresh fails with `user-token-expired`, the SDK signs out, and `AuthProvider.tsx:98–104` runs `clearDeviceData()` before the reset; within the hour of token validity, `users/{uid}` is gone → `notMember` → the new row-2 wipe. Both paths end in a wipe. (Emulator codes differ, per §3.8 stop 2–3; 5c re-checks on the pilot.)
- **Rules allow every refresh read with no new indexes.** `firestore.rules:134,138,179,202,252`; the notes `orderBy("createdAt")` and the restaurants `orderBy("name")` are single-field automatic indexes.
- **Evidence freshness.** `RestaurantDetailPage.tsx:62,84` passes `useToday()` (`useToday.ts:6–20`, local day, refreshed at midnight and on visibility) into `evidenceStatus`/`summariseEvidence` (`evidence.ts:14–20`); `toClaim` already stores `checkedAt`/`expiresAt` as `CalendarDate` strings (`repository.ts:95,100`), so a copy of those fields computes "needs rechecking" against today, not the download date.
- **Writes stay disabled on the copy.** The `offline` read state disables every write control (`RestaurantsPage.tsx:63–65,87`, `RestaurantDetailPage.tsx:110,118–120,136–143`, `NotesSection.tsx:75,147–170`) and `write()` refuses when `navigator.onLine === false` (`repository.ts:157`); a direct navigation to a form with `onLine === true` ends in `unavailable` → "offline" outcome, as today.
- **Memory cache cannot answer the start-up membership read.** Default persistence is `MemoryEagerDelegate` (`common-CLMydGSF.esm.js:26069`); the one-shot listener behind `getDoc` is unlistened on delivery (`:26680–26690`), so no `users/{uid}` or `households/{hid}` document survives in cache. P1-1's `getDocFromServer` pin makes this a property of the code rather than of GC policy.
- **Cross-tab epoch argument** holds for overlapping readwrite scopes, including the queued-behind-`clearCopy` case, provided P3-13's scope and equality points are applied. The 5a `pendingClear` marker and the cleaner's 5 s timeout compose correctly: a timed-out `clearCopy` leaves the marker, the reload blocks, and the late transaction can only delete.
- **Legacy `"1"` marker compatibility** (1949–1950) is trivially correct with P3-8's scheme.

## Open questions for the owner

1. **Opt-in after sign-out.** The cleaner deletes `optIn`, so each sign-in requires opting in again (privacy-correct, but ruling 2 says "once per account on each device"). Keep the uid-keyed opt-in across sign-out, or accept re-opt-in per sign-in?
2. **Use the copy while the app is running** (P2-2): confirm that a cache-backed read should fall back to the copy, with the same "Offline copy from …" banner, rather than only after a cold start.
3. **Start-up wait on a stalled connection** (P2-3): is up to ~36 s of "Loading…" acceptable in 5b, or should 5b render the copy early from the persisted uid and reconcile when Auth resolves?
4. **Household move** (P2-4): silently wipe and re-download, or show a one-line notice ("Your household changed; the offline copy was replaced")?
5. **`permission-denied` from a rules/client mismatch** (1831–1832, 1879) wipes the copy on every refresh after a bad deploy until fixed. Accept, or require two consecutive denials before wiping?
