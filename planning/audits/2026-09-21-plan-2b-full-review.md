# Plan 2b independent full review

Reviewed commit: `a0ec809875ecdeb5c7539c71fc0f0fd4f5d21fbc`.
Baseline: `main` / GitHub main at `a3403d1461bb3de112adebb04e2fa0a2d48ffca5`.

## Verdict

**Changes requested: two P2 findings and one P3 finding.** The existing gate passes independently, but additional probes expose a wrong-document deletion and an unlabelled cached-evidence state. Fix the P2 findings before treating Plan 2b as closed. No P0/P1 finding was identified within this review's scope.

Reviewed the current branch against main, with particular attention to §3.5, records/rules concurrency, evidence dates and precedence, auth/membership isolation, worker upgrades, configuration guards, fixtures, and CI. This includes the interactions with the earlier foundation and PWA work, rather than only the final fix commit. Legacy Swift source and tests, and AGENTS.md, are unchanged from main; removed legacy deployment scripts/configuration and compiler caches are separate from those sources. No Swift build was attempted on Linux.

GitHub was checked read-only: draft PR #1 remains open against main at `17ebe57476010f856feb5c1a614c27b57ef93121`. HEAD is **19 commits ahead of that remote**, including the design/revision/plan documentation, and 79 ahead of main. There is no hosted-CI evidence for the unpushed HEAD. No push, merge, deployment, or application-code fix was performed during this review.

## F1 — P2: a live update transfers delete confirmation to a different claim

Location: `web/src/records/RestaurantDetailPage.tsx:113–114`; confirmation state/action at lines 21–43.

The single latest `ClaimCard` has no identity key. Its `confirming` state survives when a newer snapshot changes `entry.latest` to another claim. The confirmation button then calls `onDelete` with the **new** claim's id.

Reproduced in a component test and Chromium against the real emulator-backed repository:

1. Show claim `old` (checked 1 September) and click its Delete button.
2. While confirmation is open, insert claim `new` of the same kind, checked 2 September. The browser receives the live snapshot.
3. The latest card now shows `new` with an already-open “Yes, delete” button.
4. Click it. An admin query finds only `['old']`: **`new` was deleted**, although the user opened confirmation for `old`.

This is an application concurrency defect, not a rules-authorisation bypass: either household member is allowed to delete either claim, so the rules cannot identify the mistaken user intent.

Correction: bind confirmation to claim identity, for example `key={entry.latest.id}` on the latest card, and ensure replacement claims always require their own confirmation. Add a live-replacement regression, including the case where another member deletes the latest claim and a historical claim becomes latest.

## F2 — P2: cached claims can be displayed without the cache/offline notice

Location: `web/src/records/RestaurantDetailPage.tsx:79–83,105–106`.

Restaurant and claims snapshots have independent metadata. With restaurant `ready` and claims `offline`, the page renders the cached claims and their normal evidence summaries, but no offline notice. `claimsReady` includes `offline`, so `!claimsReady` suppresses the claims notice; the restaurant notice is empty for `ready`.

A component probe supplies those two states and confirms that `read-offline` is absent while cached evidence renders. This state is distinct from the deferred cosmetic duplicate-notice issue. It violates §3.5's explicit requirement to identify cache-backed reads; a missing or stale claim collection must not look like an authoritative server result. The probe verifies component behavior; it does not simulate a network partition in Chromium.

Correction: show a notice whenever either snapshot is cache-backed, while avoiding duplicate notices and retaining separate loading/error/denied handling. Cover both mixed states (`ready/offline`, `offline/ready`), both offline, and an empty cached claims collection. Also retain the specification's disabling of mutation controls while offline.

## F3 — P3: URL validation accepts syntax the rules reject

Location: `web/src/records/validation.ts:13–17,31–36`; rules URL predicate at `firestore.rules:27–28`.

`new URL('https:example.com')` accepts and interprets the string as HTTPS, so `isHttpUrl` returns true. The normaliser only changes scheme case and submits the original malformed spelling. The rules require `https?://.+` and reject the write.

Reproduced through the restaurant form in Chromium: entering `https:example.com` yields no website field error, then Save displays the permission outcome suggesting the user sign out and back in. Re-authentication cannot fix that input. Claim source URLs share the same validator and have the same mismatch by inspection; that second form was not separately browser-probed.

Correction: require the explicit http(s) prefix used by the policy, or canonicalise before validating and storing. Add cases for missing/single slashes as well as the existing uppercase-scheme case, for restaurant websites and claim sources.

## Independent validation

| Check | Result |
| --- | --- |
| Root typecheck, including web app/node/e2e and functions/tests | Pass |
| Existing web unit suite | 177 passed |
| Functions and Firestore rules emulator suite | 163 passed |
| Existing emulator browser suite | 12 passed, retries off |
| Root compile-only build | Pass |
| Three fresh synthetic builds | Pass |
| Boot-guard / preview / upgrade browser suites | 1 / 4 / 7 passed |
| Unconfigured deployable build | Exit 1 with configuration-validator reason |
| NODE_ENV=development plus compile-only bypass | Exit 1 with non-production-guard reason |
| Ambient project override on preview fixture | Exit 1 with fixture-identity reason |
| Production-project guardrail grep and tracked diff whitespace check | Pass |
| Additional component probes | Two expected failures, F1 and F2 |
| Additional emulator/browser probes | Two expected failures, F1 and F3 |

The existing 36-run stress result was not independently repeated. The additional failures are outside the existing passing suites and are preserved below. Temporary test files were removed from web/src and web/e2e afterward; tracked application, rules, functions, and AGENTS.md files remain unchanged.

Build/provenance, invalid-release cleanup, two-tab prompt behavior, membership isolation, version conflicts, claim immutability, calendar-day boundaries, and the normal mark/sweep/remove path are covered by the independently passing checks. This does not establish real iPhone/Safari behavior, deployed Firebase/Hosting correctness, or the duration of the first hosted run under its 25-minute timeout. Rules and hosting still need a coordinated owner-controlled deployment.

## Reproduction evidence

`planning/audits/plan-2b-review-probes/` contains:

- `detail-states.test.tsx.txt`: component regression probes, copied into `web/src/records/audit-review.test.tsx` to run with `npm --prefix web test -- src/records/audit-review.test.tsx`.
- `browser.spec.ts.txt`: diagnostic browser probes, copied into `web/e2e/audit-review.spec.ts` for the emulator command below. The deletion probe deliberately clicks the incorrectly transferred confirmation to prove which document is removed; after the fix, convert it to assert that the new claim requires a fresh confirmation.
- `unit-output.txt` and `browser-output.txt`: observed failures. The original component run also contained the five unchanged detail-page tests, which passed; the preserved probe source contains just the two added tests.

Browser command, from the repository root after building functions:

```bash
FUNCTIONS_DISCOVERY_TIMEOUT=90 ./node_modules/.bin/firebase emulators:exec \
  --only auth,firestore,functions --project demo-safebite \
  'node functions/lib/seed-emulator.js && npm --prefix web run e2e -- audit-review.spec.ts --retries=0'
```

Run only against the disposable demo emulators: the browser fixture clears household test records. Remove the temporary probe copies after running, since they intentionally fail on the audited commit and a file under web/src also changes the synthetic build provenance hash.

The report and reproduction evidence are left uncommitted for owner review.
