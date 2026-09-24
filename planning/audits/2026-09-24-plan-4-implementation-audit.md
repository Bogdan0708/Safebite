# Plan 4 implementation audit — 2026-09-24

**Verdict: changes requested.** Audit target: `42e80c5f312f65458f3549f30e6531b4f08d1074` on `worktree-pwa-04-collection`, compared with merged main `6923a97d4f0e638fb0aa6a39c51c39b8249816d2`. Git counts **19 commits** after that base. The checkout was clean on entry. Three independent review scopes covered rules/deletion, auth/password/worker interactions, and records UI/data flow; the primary reviewer checked their findings and ran the local gates.

## Findings

### F1 — P2: an open visit-date draft silently adopts a newer version

**Source:** `web/src/records/StatusBlock.tsx:31`, `:45`, `:63`, `:83–94`.

The date editor stores only its string. Every incoming collection snapshot recalculates `base` from the newest version, even when the date field still contains an older draft. If Ava opens version 1, Bogdan saves another date as version 2, and Ava then saves her existing draft, her write uses version 2 and succeeds. The other member's change is overwritten without a conflict, and the new date was hidden behind Ava's editor. The repository's version check is correct; the component gives it the wrong base.

**Reproduced:** a focused test imports the actual component, opens a draft at version 3, rerenders with version 4, and observes `setVisited(..., 4, oldDraft)` instead of base 3. A second probe used two authenticated Chromium contexts against the real rules: Ava opened version 1 with a 4 May draft; Bogdan saved 10 May as version 2; Ava received that snapshot and then saved. Final state became 4 May, version 3, with no conflict displayed.

**Fix:** capture the base version alongside the date when editing starts. Retain it across live updates until explicit cancellation/reseeding or successful save. A remote change must cause the stale draft to return `conflict` and show the current state, consistent with §3.7.

**Regression:** open a date draft at version 1, let another authenticated member save version 2 and deliver that snapshot to the first page, then save the first draft. Assert conflict and no overwrite. Cover a base-0 draft whose document is created by the other member too. Existing component tests mock a conflict result; they do not verify this live-snapshot interval.

### F2 — P2: typing while a note save is pending loses unsaved text

**Source:** `web/src/records/NotesSection.tsx:58–61`, `:71`, `:99–103`, `:139`.

Both note textareas remain editable while the corresponding save button is busy. A save submits the text captured at the click. If the member adds or changes text before that promise resolves, a successful create unconditionally clears the composer; a successful edit unconditionally closes the editor. The later text was neither submitted nor preserved. Slow mobile connections make this a normal interaction, not a conflicting-client attack.

**Reproduced:** two focused tests import the actual NotesSection and defer its repository promise. Additional text is accepted while saving, then the composer becomes empty / editor disappears after success. The mocked write arguments contain only the pre-edit submission.

**Fix:** either lock the textarea during the submitted operation or preserve edits made since submission and retain a usable editor. Apply the same policy to create, edit and Keep mine. Failure must retain the draft as already promised.

**Regression:** hold the save promise pending, type additional text, resolve success, and assert that the new text cannot disappear unsaved. Cover both composer and existing-note editor.

### F3 — P2: a password update can succeed while the UI says the old password works

**Source:** `web/src/auth/changePassword.ts:18`, `:39–46`, `:59–62`; `web/src/pages/ChangePasswordForm.tsx:35–40`.

The installed Firebase Auth SDK sends `accounts:update` and then performs an account lookup/token persistence before resolving `updatePassword`. A failure after the password-changing request has succeeded rejects that promise. The current helper treats this as an ordinary failure: an unknown error says “Your old password still works”; a network failure says to connect and try again with the retained old current-password field. Neither accounts for a password that already changed.

**Reproduced:** a Chromium probe let the real local Auth emulator commit the new password, then failed the subsequent `accounts:lookup`. With an injected internal error, the screen said “Your old password still works”; independent Auth sign-ins returned `oldAccepted: false`, `newAccepted: true`. Aborting the lookup instead produced the offline/retry message with the same credential results. The synthetic fixture password was restored after each case.

**Fix:** distinguish failures before attempting the update from ambiguous completion after attempting it. Do not promise that the old password works after an uncertain update; provide recovery guidance that allows for the new password already being active. Preserve definitive policy/wrong-current outcomes where justified. Amend the same incorrect promise in §3.7.

**Regression:** allow the real local Auth emulator password update to succeed, fail the subsequent lookup, then independently verify old/new credential acceptance and the recovery message. Test both an internal error and network loss.

## Confirmed safeguards and limitations

- The previous mixed-version deletion defect is closed for the shipped clients. Old finishers cannot set `cleanupDone`; current finishers sweep claims and notes, remove collection state, mark completion, and remove the parent. Transaction rereads/skip-missing behavior supports concurrent finishers and resumption. Existing real-rules tests and browser cleanup scenarios passed locally.
- `cleanupDone` is **client attestation**, as §3.7 explicitly acknowledges. Rules do not prove that claims/notes are empty. This audit does not elevate it to a guarantee against arbitrary modified member code. Firestore parent deletion does not cascade: [official documentation](https://firebase.google.com/docs/firestore/manage-data/delete-data#delete_documents).
- Collection writes enforce membership, writer identity/name, exact shape, version progression and calendar dates. Notes enforce author attribution and author-only edits, with the specified deletion-sweep exception. Neither feeds evidence freshness.
- The auth observer now resets every same-origin tab on sign-out/account change and invalidates stale membership callbacks. The same-context browser regression checks actual document replacement and avoids test-driven navigation between account changes. Firebase's cross-tab behavior is documented [here](https://firebase.google.com/docs/auth/web/auth-state-persistence#expected_behavior_across_browser_tabs).
- The deletion emulator test mirrors the production sequence rather than importing it. The current sequences match, but future drift remains possible. Browser cleanup tests exercise the real repository. A later shared harness would strengthen this without blocking the present fixes.
- Small evidence/documentation inaccuracies: README still says 352 web tests; the actual suite has 354. The password browser test's visible navigation assertion alone does not prove absence of a document reload; a window marker would strengthen it. These are lower priority than F1–F3.

## Validation

Independently run at the audited SHA:

| Check | Result |
|---|---|
| `npm run typecheck` | Pass, both packages and configured TS projects |
| `npm run test:unit` | 354 passed across 36 files |
| `npm run emu:test` | 352 passed across 16 files; local Auth/Firestore/Functions |
| `npm run emu:e2e:stress` | 114/114 passed; 38 scenarios × 3; retries disabled; 8.1 minutes |
| Root compile-only build and three synthetic builds | Pass |
| Boot-guard / preview / upgrade | 1 / 4 / 7 passed |
| CI's empty-config / non-production / ambient-fixture build refusals | Each refused for the expected reason |
| Guardrail scans, ignored local secret, `git diff --check`, unchanged Swift tree | Pass |
| Added diagnostic component probes (outside normal suite) | 3 expected failures, reproducing F1 and both F2 paths |
| Added diagnostic browser probes | Confirmed F1 against real rules; confirmed F3 with both internal-error and network-loss injection after a real password update |

These green existing suites do not cover the new failure intervals. Diagnostic failures are recorded separately from the passing repository suite. The complete browser repeat log and the focused probe sources/output are preserved in `planning/audits/plan-4-review-probes/`.

Read-only GitHub checks found no remote `worktree-pwa-04-collection` branch and no hosted CI runs for it. Local gates are not hosted CI evidence for this SHA. Live staging, credentials, deployed rules/functions/hosting and real iPhone/Safari behavior were not inspected or changed. O3–O6 are recorded complete in the current spec; this audit does not independently re-certify those owner actions.

Application/specification files were not changed. Audit artifacts remain uncommitted; nothing was pushed, merged or deployed. After fixing F1–F3, rerun the focused regressions and affected local gates, then require hosted CI on the eventual pushed SHA. Plan 5 still needs to include notes and collection state in export/account deletion.
