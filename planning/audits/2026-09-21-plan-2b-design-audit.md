# Plan 2b design audit

Reviewed: `27ca7acdb3099ac9ff5d5d92629eef602389eb63`, spec section 3.5, lines 360-498.
Date: 2026-09-21. Scope: design review before the implementation plan; no feature implementation, merge, push or deployment.

## Verdict

Revise section 3.5 before writing the implementation plan. The six product decisions remain workable, but the specified mechanisms do not yet guarantee complete deletion, accurate conflict reporting, stable evidence dates, online-only editing, or preservation of drafts in other tabs. Two build/update claims were directly contradicted by isolated tests using the installed dependencies.

The findings below concern the proposed design, not regressions already present in implemented restaurant features. Plan 2a-h's P2 closure remains valid.

## Findings requiring resolution

### F1 — P2: querying claims then deleting that result in a batch is not complete cascading deletion

Spec: lines 370-372, 431-433, 447-449, 490-491.

Ava queries claims A and B. Bogdan adds C before Ava commits the batch deleting A, B and the restaurant. C survives under a missing parent. The proposed claim rules also allow members to create claims for a missing parent: membership alone does not establish restaurant existence. A parent-existence check stops later creates but does not solve C arriving between the query and deletion. The happy-path browser assertion that the restaurant list is empty will miss the orphan.

Choose a deletion protocol explicitly. One client-only option is a rules-enforced deleting state that blocks new claims, followed by bounded, resumable cleanup and final parent removal; this requires model/rule/UI changes. Alternatively define a bounded, enforceable concurrency invariant for the atomic approach. Do not assume that an unbounded subcollection can always be removed in one batch. A server callable is another option, but would change the stated scope and is not necessary to mandate here.

Require tests for add-versus-delete interleaving, missing-parent claims, interrupted/retried cleanup, and actual absence of child documents after success. [Firebase documents the lack of an atomic collection-delete operation and automatic subcollection cascade](https://firebase.google.com/docs/firestore/solutions/delete-collections?hl=en).

### F2 — P2: the conflict contract conflates permissions with versions and leaves live drafts undefined

Spec: lines 427-452, 458-460, 489-490.

`permission-denied` after local validation can mean revoked membership, a rules/client mismatch, or an invalid server-validated field, as well as a stale version. Turning all such errors into "changed on another device" sends users into a misleading Reload loop.

Define separate conflict, permission, not-found and unavailable outcomes. A transaction can compare the current version against the captured `expectedVersion` and throw a domain conflict before writing; the comparison must run on every transaction retry, so retrying does not silently overwrite a newer edit. Alternatively perform an authoritative read after a denied write and classify only a confirmed version mismatch as a conflict; a failed read must retain the permission/unavailable error.

Also distinguish the live snapshot from the editable draft and its base version. Incoming snapshots must neither overwrite dirty fields nor advance the draft's expected version. Only explicit Reload or an acknowledged successful save may replace that baseline. Preserve fields not exposed by the form, including coordinates/place ID. Test revocation, remote deletion, dirty-draft preservation, and the existing two-context stale save.

### F3 — P2: evidence dates change with the viewer's timezone, and same-day claims have no defined precedence

Spec: lines 418-421, 443-446, 467-477.

Reproduced with JavaScript: a date entered as 21 September at midnight in Rome is displayed as 20 September in London and New York under the proposed timestamp/local-formatting scheme. Locale `en-GB` controls formatting, not timezone. This is material for a travel app's checked dates and expiry boundaries.

Choose a calendar-date contract independent of device timezone. For example, canonical UTC-midnight timestamps interpreted and displayed as UTC calendar dates, with an explicit definition of what "today" means for future-date rules; or date-only values with corresponding rule changes. Specify inclusive/exclusive expiry, the exact 12-month boundary, leap-day/end-of-month handling, and timezone/DST tests. No timezone choice should be silently inferred by the implementer.

Because checked dates have day precision, opposing claims can share `checkedAt`. Specify ordering and conflict presentation instead of allowing an incidental document-ID tie-break to determine the prominent safety evidence. Test two same-kind, same-day claims with opposing values and different sources, including expiry differences. Define when an open detail page recalculates freshness as time passes without a new Firestore snapshot.

### F4 — P2: the online-only write and snapshot acknowledgement contract is missing

Spec: lines 373-374, 447-452, 474-491; existing spec 2.6 says edits require connectivity.

Disabling persistent storage does not disable the SDK's memory cache or its offline write queue. An `onSnapshot` callback can include pending local changes before the server accepts them. Thus an offline or subsequently rejected claim can appear locally unless the implementation distinguishes pending state from confirmed evidence. Server timestamps can also be unresolved in pending snapshots.

State how create/update/delete behave offline and when connectivity disappears during a save. Do not label success or authoritative evidence until server acknowledgement. Define treatment of `hasPendingWrites`, `fromCache`, nullable server timestamps, listener errors, deleted documents and membership revocation. An empty list is not a suitable substitute for an unavailable or denied read. Scope listeners to the active household/user, unsubscribe and discard stale callbacks on changes.

If online-only writes are a strict guarantee, transactions are an option for supported operations; a simple connectivity indicator alone cannot guarantee it. Add disconnected-save, rejection/rollback, and account-switch tests with actual records. References: [memory cache is the default](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [snapshots precede backend acknowledgement](https://firebase.google.com/docs/firestore/query-data/listen), and [transactions versus offline-capable batches](https://firebase.google.com/docs/firestore/manage-data/transactions).

### F5 — P2: default prompt behaviour can discard another tab's draft

Spec: lines 375-376 and 383-393.

Reproduced in a minimal two-tab Chromium app using installed `vite-plugin-pwa` 1.3.0 and the exact proposed `registerType: 'prompt'`, `onNeedRefresh`, and default `updateServiceWorker()` wiring. Tab B held `unsaved restaurant edit` on v1. Both tabs displayed the banner. Clicking Reload only in A moved B to v2 and cleared B's field without a click in B.

The plugin's prompt registration reloads on a controlling-worker event; approval in one tab is not per-tab draft consent. Decide whether to coordinate activation across open clients, retain drafts safely, or explicitly control each tab's reload through `onNeedReload` and an appropriate compatibility strategy. Merely keeping the first tab on v1 until a click is insufficient. Add a same-browser-context two-tab test, distinct from the Ava/Bogdan conflict test in separate browser contexts.

Limit "nothing reloads until tapped" to ordinary valid-release updates: misconfiguration recovery must retain Plan 2a-h's exceptional purge/navigation behaviour. Keep all invalid-upgrade regressions.

The sign-in field is a reasonable single-tab smoke-test stand-in. It does not establish the lifetime and version behaviour of an actual dirty restaurant draft; cover those separately.

### F6 — P2: `includeManifestIcons: false` does not remove the manifest duplicate

Spec: lines 402-403.

The installed plugin adds `manifestFilename` to `additionalManifestEntries` whenever a manifest exists, outside its `includeManifestIcons` conditional (`web/node_modules/vite-plugin-pwa/dist/index.js:103-138`). The current `globPatterns` also includes `webmanifest`.

A minimal build with `includeManifestIcons: false` produced these URLs: `registerSW.js`, `manifest.webmanifest`, `index.html`, `manifest.webmanifest`. The proposed uniqueness assertion will fail.

Keep the flag for icon deduplication, and remove `webmanifest` from the glob or otherwise exclude that file so the plugin alone adds it. Retain the artifact uniqueness assertion and manifest/icon availability checks.

### F7 — P2: mode files and directory-existence checks do not establish deterministic test builds

Spec: lines 394-401.

The current inline environment assignments override ambient values. Moving them into `.env.<mode>` files changes precedence: exported `VITE_*` values and mode-local overrides can replace the intended synthetic project. The deployability interlock compares validity, not exact fixture identity; a real shape-valid project can satisfy both sides. [Vite documents this precedence](https://vite.dev/guide/env-and-mode).

Make test builds hermetic for the relevant Firebase variables, or reject any resolved values that differ from the selected synthetic fixture. Test with conflicting shell and mode-local values. Keep the existing non-production and worker-decision guards.

A dist directory can also exist but be stale or belong to another mode/commit. Require a build identity/config stamp or an equivalent verification for test-only scripts. CI's clean build order is sound, but local tests must not claim coverage of current code using old artifacts.

## Additional contract/test corrections

- **Rules drift test:** substring presence can pass for a comment, an unused function, or an over-permissive condition. It also cannot detect an extra allowed literal absent from TypeScript. Retain it only as a smoke check; use table-driven emulator tests for all enum members and representative invalid kinds/values/source types. Check nested `source` extra keys, wrong types, required fields, whitespace-only required strings, timestamp boundaries and unauthenticated/cross-household writes.
- **Accrediting-body URL parity:** line 469 makes URL mandatory whenever source type is `accreditingBody`; lines 420-421 only require it for accreditation claims. Choose one policy and enforce it consistently in form, pure validation and rules. The stronger policy is reasonable.
- **Author display:** claims contain `authorUid`, but existing rules permit reading only one's own `users/{uid}` document (`firestore.rules:20-22`). Define whether the UI shows a UID or uses a household-readable, admin-managed display-name source. Do not introduce peer-user reads implicitly.
- **Schema states:** include document IDs in client types and distinguish pending/read models from write input/sentinels. `No other keys` must apply to nested source maps as well as document roots.
- **Indexes:** the two stated single-field orderings do not demand a new composite index. If evidence precedence is implemented with additional server-side ordering, reassess the no-index promise; client-side deterministic ordering is another option.
- **Scope language:** these are immutable claim documents with permitted deletion, not a permanent append-only audit trail. Avoid implying retained history after an explicit claim deletion.

## What can stand

Saved-tab routing/testid preservation, keeping the banner outside the router, immutable claim updates, fixed field limits, server-owned timestamps, optional paired coordinates, accreditation-source checks, in-page delete confirmation, and keeping Places out of scope are reasonable. The Swift question strings exist in `SafeBite/SafeBite/Resources/Localizable.strings:160-163`; three groups are cuisine-specific, so label them accordingly instead of calling all four general questions.

## Evidence and housekeeping

Reviewed the exact committed section, current rules/auth/bootstrap, installed plugin code, and current primary documentation. Ran isolated precache, timezone, environment-precedence and two-tab probes; did not rerun the full application suite because this commit changes only the design document. Probe outputs live under `/tmp/safebite-spec-precache-LhlmZG` and `/tmp/safebite-prompt-multitab-cWHRNL`. Reproduce the two-tab result from the repository root with `node planning/audits/plan-2b-prompt-multitab-probe.mjs`; it uses only an ephemeral localhost server and temporary builds. The environment probe confirmed an explicitly supplied synthetic shell project overrides the mode file's `safebite-preview` value.

Commit the existing `planning/audits/2026-09-21-plan-2a-h-recheck.md` with the eventual implementation plan to preserve the predecessor's closure evidence. Leave its historical commit and test claims unchanged. This new design review can accompany the revised specification; neither report was committed by this audit.
