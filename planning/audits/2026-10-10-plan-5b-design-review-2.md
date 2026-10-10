# Plan 5b design review 2 — 2026-10-10

Reviewer: owner-supplied review of the amended §3.9, against `9294048`. Read-only design and source
review; no emulator or real-iPhone tests were run. Recorded here as received (paths shortened);
every finding was verified and amended in §3.9 (see its second review table).

**Verdict: changes requested before the implementation plan.** Option 1 remains sound, but the
amended §3.9 still has several gaps.

1. **P2 — The timer can indefinitely skip refreshing a stale copy.** The refresh triggers skip the
   download when every active listener has received a server snapshot. Those listeners cover the
   open pages, and their results are not specified as being persisted into the copy. Another
   member can change evidence for an unopened restaurant while this condition remains true. The
   device then enters a dead zone with outdated evidence. *Amendment:* retain the periodic full
   refresh unless completeness and freshness of the stored household copy can be demonstrated. A
   server-backed listener establishes the state of its particular query.
2. **P2 — An older refresh can overwrite a newer copy across tabs.** The single-flight rule applies
   only within one document. Tab A can fetch old evidence and pause; tab B saves newer evidence
   into the copy; A then commits its older results. Both have the same cleanup epoch, UID and
   household, so all specified checks pass. The rollback can also receive a newer `downloadedAt`.
   *Amendment:* add a copy revision checked and incremented atomically by every full and partial
   replacement, rejecting and retrying stale work, or coordinate refreshes across tabs. Test
   full-versus-full and full-versus-partial interleavings.
3. **P2 — Startup cleanup can still erase another run's failure marker.** Pending-clear keys give
   each run its own key, but the startup screen removes every pending key after success. If
   another tab starts a clear after that startup cleanup began, its new marker can be removed even
   when its cleanup fails. *Amendment:* capture the keys before running cleanup and retire only
   that captured set after success. Preserve newer keys and recheck the gate before opening the
   app. Add this specific startup-versus-concurrent-clear regression.
4. **P2 — Confirmed access loss from a live listener lacks a cleanup path.** The read-source rules
   describe cache snapshots and `unavailable`, while only the refresher sends `permission-denied`
   through membership revalidation. An already-running member can receive a listener denial,
   retain the persisted copy, and subsequently reopen it offline before another membership check.
   *Amendment:* route live-listener denials through the same server membership check. Confirmed
   revocation must invalidate the copy and current readers. Test revocation while the app is
   already online, as well as reconnection.
5. **P2 — Clearing storage does not invalidate copies already displayed in other tabs.** Offline
   subscriptions read once and again on state changes. If tab B disables offline storage, clears
   device data, or detects revoked membership, tab A's Auth identity need not change; its
   `offlineMember` state can continue displaying the previously loaded copy. *Amendment:* define
   cross-tab invalidation for pending cleanup, epoch changes and opt-out, including removal of
   already-rendered copy data. Recheck eligibility when a suspended tab resumes.
6. **P2 — Read-only enforcement misses routes without a data listener.** The spec assumes an
   `offline` read state disables every write. The restaurant creation form
   (`web/src/records/RestaurantFormPage.tsx:79`) has no restaurant subscription in create mode,
   so its offline flag stays false; directly reopening `/restaurants/new` can leave Save enabled.
   A failed server transaction does not satisfy the promised disabled controls. *Amendment:*
   explicitly gate write routes and submit handlers on offline membership/read-only mode. Test
   direct navigation and forms already open when connectivity drops.

Two smaller contracts also need explicit wording: partial refreshes must preserve the global
**last complete download** timestamp, and an already-open or resumed offline session must recheck
the 30-day limit even when membership retries keep returning "no answer".
