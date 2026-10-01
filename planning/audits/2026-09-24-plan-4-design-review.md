# Plan 4 design review — §3.7

Reviewed commit: `a149918116df8358abfe67289d149cd6dd3e89d6` on `worktree-pwa-04-collection`.
Reviewed worktree: `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-04-collection`.

## Verdict

**Changes requested before the implementation plan: two P2 design findings and one P3 correction.** The shortlist/visited/notes model is coherent, but the rollout/deletion and account-switch contracts need amendment. This is a source-and-design review, not a claim that unimplemented Plan 4 behavior has been runtime-tested.

Compared §3.7 and the §2.3/§3.3 changes with the existing rules, records repository, authentication, page lifecycle and browser helpers. Independent review passes covered database/deletion and authentication/password behavior. Current official Firebase documentation was checked for the relevant platform guarantees. No production configuration, secrets or deployed data were inspected or changed.

## F1 — P2: old clients can bypass the expanded deletion sequence

Spec locations: lines 949–953 and 1028–1029; collection deletion condition at 923–925. Existing code: `web/src/records/repository.ts:232–252`, `web/src/records/RestaurantsPage.tsx:34–41`, `firestore.rules:128–129`.

The deploy note says the old client never touches the new paths, so rules-first deployment is safe. However, it still deletes their parent restaurant. The existing client finishes deletion by sweeping claims and deleting the restaurant; the current final-delete rule requires only membership and `deleting == true`. It also automatically resumes marked restaurants when the Saved page mounts. §3.7 extends the new client sequence but supplies no revised final-delete/old-client contract.

Concrete mixed-version scenario:

1. A Plan 4 client creates restaurant notes and `collection/{rid}`.
2. An old open client deletes that restaurant, or resumes a deletion started by the new client.
3. It sweeps claims and removes the restaurant without sweeping notes or collection state.
4. The restaurant vanishes from the list, removing the normal resume entry. The collection document cannot satisfy the proposed delete rule anymore because its parent is absent; another member's orphaned notes likewise cannot be swept through the proposed parent-deleting exception.

Firestore does not cascade document deletion to subcollections. [Firebase deletion documentation](https://firebase.google.com/docs/firestore/manage-data/delete-data#delete_documents). The separate collection document also survives independently. This is a concrete consequence of the proposed compatibility contract, not a reproduced production incident.

**Required amendment:** define how incomplete cleanup prevents final parent deletion across bundle versions: a completion gate in the protocol/rules that old finishers cannot skip, server-owned cleanup, or an explicitly enforced cutover that prevents old clients from deleting once Plan 4 data exists. A version marker added only at the initial mark is insufficient if the old resumer can still finish an already-marked document. Merely deploying hosting does not replace every open tab. Do not describe the rollout as unconditionally safe because old clients ignore the new paths.

**Acceptance:** run the old deletion/resume path against the new rules and seeded notes/collection state, including an old resumer racing a new deleter. Either refuse final deletion while preserving a resumable parent or complete all cleanup. Also cover two new-client sweepers and retries after each intermediate step; missing notes/state/parent must not turn successful concurrent cleanup into a misleading permission failure.

If the first-ever deployment will provably contain only Plan 4 clients, that can be documented as a limited rollout precondition instead; it is not a general compatibility guarantee for cached bundles or rollback.

## F2 — P2: the sign-out reset covers only the initiating tab

Spec locations: lines 987–989 and 1024. Existing code: `web/src/firebase.ts:23–25`, `web/src/auth/AuthProvider.tsx:67–85`.

Firebase's default browser auth persistence synchronizes auth state between same-origin tabs. [Firebase persistence documentation](https://firebase.google.com/docs/auth/web/auth-state-persistence#expected_behavior_across_browser_tabs).

With household data loaded in tabs A and B, the proposed `signOut()` wrapper reloads A. B receives an auth-state callback and hides/unmounts its member shell, but does not execute A's wrapper. Its module-scoped Firestore instance and memory cache remain. The design therefore does not meet its cache-clearing promise in all open documents. This finding establishes incomplete clearing, **not demonstrated unauthorized rendering**.

**Required amendment:** define a reset in every document that observes a previously authenticated UID become null or a different UID. Coordinate that with the explicit sign-out action; initial signed-out startup and same-UID token/reauthentication events must not cause reload loops. Hiding the old UI and invalidating pending callbacks remain necessary while reset occurs. A full reload is a reasonable implementation, but is not the only possible reset mechanism.

**Acceptance:** two pages in one browser context, both with loaded records/notes; sign out in one, assert reset and removal of previous-account state in both, then sign in as the non-member without test-driven navigation. The existing auth helper calls `page.goto('/')`, and the account-switch test also calls `page.reload()` (`web/e2e/auth.spec.ts:6,59`); using those between identities would clear memory independently and conceal a broken application reset. Separate contexts used for two household members do not exercise shared auth persistence.

## F3 — P3: password-update rejection is missing from the error contract

Spec location: lines 991–996.

Eight characters is a reasonable client minimum for this design, but Firebase's server policy can impose different length or composition requirements; six is a default, not a universal policy. [Firebase password-policy documentation](https://firebase.google.com/docs/auth/web/password-auth#recommended_set_a_password_policy). No live project-policy check was performed, so this is an incomplete contract, not an observed staging failure.

Keep the proposed reauthentication followed by `updatePassword`, but add password-policy rejection (including `auth/weak-password`) and an unknown-error fallback. Reauthentication failure must not invoke the update. Successful reauthentication followed by a rejected update must show an actionable error, retain usable controls and never report success. Treat eight characters as client validation, or separately make it an explicit owner-controlled server-policy requirement.

## Decisions and implementation-plan clarifications

- **`updatedByName`: accept.** Comparing it with the caller's own admin-managed user document on every state write is consistent with the existing evidence-author design. It records the name at the time of the last change; it does not require peer-user reads.
- **2,000-character notes, transient filter choice and no list toggles: accept.** These are bounded choices consistent with the pilot scope. The notes limit still needs actual boundary rules tests, not just a literal-parity check.
- **Reload on sign-out: acceptable once F2 covers all documents.** Replace the claim that it is the only provable reset with the narrower guarantee the implementation will test.
- **Joined read states:** specify behavior while either restaurant/collection listener is loading, denied or errored. An unknown collection snapshot must not be interpreted as an empty shortlist or base-version-0 record. Confirm absence from a server-backed snapshot before allowing the missing-state default; authoritative empty messages require the necessary ready snapshots, as §3.5 already requires. Keep one offline notice without suppressing errors. Add mixed-state tests for list and detail.
- **Deletion/notes concurrency:** in addition to the mixed-version case, test duplicate sweepers, author editing/deleting while a restaurant is marked, and a stale note edit/delete on another device. Explicitly retain claim-ID-style confirmation identity for notes. Define which current text a conflict chooser adopts before the next versioned write.
- **Test isolation:** extend emulator cleanup helpers to remove notes and collection documents; isolate the password-change test's user or restore its password in cleanup. Existing browser suites assume the shared fixture password. Do not manually reload to make account-switch tests pass.

## Next step

Amend F1/F2 and the password error contract in §3.7, carry the acceptance cases into the implementation plan, and then proceed with plan review. No implementation changes or emulator/browser gates were run for this design-only review. The report is left uncommitted; the reviewed spec is unchanged.
