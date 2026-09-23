# Landing review: Plans 1–3 and pre-merge fixes

Base: `ef1934d2f32abc1d6581c3debc3c149da7b2eacd`. Scope: the uncommitted pre-merge fix set, its audit evidence and PR #1 readiness. Earlier audit reports remain historical records of the SHAs they reviewed.

## Product decision and compatibility

The original committed §3.6 specified one textbox and `{ query }`. Explicit search modes were a product change, not an already-approved requirement. The owner reviewed the recommendation on 2026-09-23 and answered **“Keep explicit search modes.”** The updated spec now records that approval.

The retained UI distinguishes Town or area from Restaurant or venue name. This adds one choice, but avoids guessing whether an ambiguous string names a place or a business. It does not add paid requests: Town or area sends one `food in <query>` request; named-venue mode sends one unchanged query. The five-category mapper and existing usage, identity, result-count and timeout limits remain in force.

The landing review found and corrected one compatibility defect in the proposed fix: omitted `mode` must preserve the old raw query, not prepend `food in`. Validation, the search dispatcher and the Google adapter now default omitted mode to venue semantics. The new UI explicitly sends destination mode for Town or area. A regression follows a legacy named-venue payload from validation to the actual captured Google request body; another tests an omitted provider argument. Four checks failed before this correction, and the focused 53-test suite passes afterward.

Deploy functions before hosting to support old cached clients and the new client together. This preserves the legacy query text, not an assertion that all provider ranking behavior remains identical: the restaurant-only request filter is intentionally removed while server-side venue filtering remains.

## Records fixes and evidence review

Independent review found no remaining blocker in claim-confirmation identity, mixed cached/server snapshot notices, URL validation, or offline deletion controls. Permanent browser tests verify the actual surviving claim IDs after replacement/deletion and successful correction of malformed restaurant and evidence URLs. The older diagnostic probes remain archived outside test discovery; their expected failures describe the old reviewed commits.

The audit artifacts contain synthetic demo-emulator data, not real credentials. Archived command output had trailing whitespace and surplus final blank lines removed for the whitespace gate; diagnostic text and results are unchanged. AGENTS.md and the legacy Swift tree are unchanged. The 2026-09-22 fix report's uncommitted status is explicitly a verification-time snapshot, superseded by this landing pass.

## Fresh local gate

| Check | Result |
| --- | --- |
| Web unit | 270 passed |
| Web and functions typecheck | Pass |
| Functions and rules, demo emulators | 282 passed |
| Emulator browser, retries disabled | 29 passed |
| Compile-only web and functions builds | Pass |
| Fresh boot-guard / preview / upgrade suites | 1 / 4 / 7 passed |
| Whitespace and audit-artifact scan | Pass |

The requested landing sequence is: commit records fixes, commit the approved discovery change, commit the audit evidence; push; require green hosted CI on that exact new SHA; only then mark PR #1 ready and merge. GitHub actions are handled by the primary assistant under the owner's explicit instruction; delegated agents performed implementation/review only.

## Release boundary

Merging these changes is not a deployment or staging acceptance. O4, real Google results for both modes, coordinated functions/rules/hosting deployment and real iPhone/Safari acceptance remain outstanding owner-controlled work. No real Places call or infrastructure configuration change was part of this landing review. Plan 4 begins from a fresh worktree at the merged `main`, not from this long-running foundation worktree.
