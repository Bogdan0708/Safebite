# Final pre-merge review

Reviewed HEAD: `ef1934d2f32abc1d6581c3debc3c149da7b2eacd` on `worktree-pwa-01-foundation`.

## Verdict

**Changes requested: fix the two remaining Plan 2b P2 findings before merging.** Both reproduce on this exact HEAD despite the passing gate. The earlier decision to park implementation work does not resolve either defect. No new P0/P1 finding was identified in this review.

This is a final re-check of the audit-response changes since `7e90e74`, their integration with records/discovery, the outstanding earlier findings, and the exact pushed PR/CI state. It builds on the earlier whole-branch reviews; it is not a fresh line-by-line review of every unchanged file.

## F1 — P2: confirmation still transfers to a different claim

Location: `web/src/records/RestaurantDetailPage.tsx:118`; confirmation state at line 23 and deletion action at line 44.

The latest `ClaimCard` still lacks a claim-identity key. Open Delete for claim `old`, then deliver a live snapshot with a newer claim of the same kind. React retains the confirmation state while replacing the claim prop. Clicking the already-open confirmation calls `deleteClaim("home", "r1", "new")`.

The current-head component probe verifies that exact wrong-id call. The earlier Plan 2b review also proved actual wrong-document deletion with Chromium and the Firestore emulator; that browser reproduction was not repeated here. This is mistaken deletion intent, not an authorisation bypass.

Bind confirmation to claim identity, for example with `key={entry.latest.id}`. A replacement latest claim must require a fresh confirmation. Add regressions for a newer claim arriving and for the previous latest being removed, exposing an older claim. The preserved diagnostic deliberately clicks the bad transferred button; after fixing, the permanent regression should assert that button never appears without a new Delete action.

## F2 — P2: cached evidence still lacks its offline notice

Location: `web/src/records/RestaurantDetailPage.tsx:109`, together with lines 80 and 84.

With a server-backed restaurant (`ready`) and cache-backed claims (`offline`), the page renders cached evidence but no offline notice. `claimsReady` includes `offline`, suppressing the claims notice, while the restaurant notice renders nothing. Independent listeners can have different snapshot metadata; the component probe supplies this supported mixed state and reproduces the missing notice.

This is distinct from the deferred cosmetic duplicate-notice issue. Section 3.5 requires cache-backed reads to be identified. Show one notice whenever either displayed snapshot is cache-backed, preserving loading/error/denied handling. Test both mixed states, both offline, and an empty cached claims collection. Retain the offline mutation restrictions.

## Remaining lower-priority finding

**P3 — URL validation/rules mismatch remains.** `web/src/records/validation.ts:14` accepts `https:example.com` through `new URL`, and line 36 preserves that spelling. `firestore.rules:28` requires `http://` or `https://`. Saving therefore reaches a permission error instead of a field validation error. This is unchanged from the earlier reproduced finding; reviewed by source comparison here, without another browser run. Require the explicit prefix or canonicalise the stored URL consistently, covering restaurant websites and claim source URLs.

## Audit-response assessment

- **Geolocation race:** the page intent counter invalidates pending location success/failure after a newer destination submission or unmount. Relevant component regressions pass; hosted browser coverage includes these paths.
- **Google data in router history / prefill:** new navigation carries only the place ID. The create form starts empty, ignores legacy name/address fields, and saves member-entered fields. This resolves the automatic provider-name/address persistence path identified by the previous review. It is not a blanket legal assessment of every possible manual use of Google data.
- **Provider filtering:** the mapper now requires an allowed venue type and drops localities/missing types. Nearby requests include the approved venue categories. This closes the non-venue-display defect.
- **Logging:** provider messages are omitted; HTTP status and allow-listed Google status remain available. Tests exercise actual Firebase logger serialization. The earlier mock-versus-logger discrepancy is addressed.
- **Documentation:** pricing, synthetic fixture provenance, and the owner ruling on place-ID-only transfer are recorded in the revised spec and execution ledger.

**Real destination-search acceptance remains open.** `functions/src/discovery/googleProvider.ts:121` sends the raw town query with `includedType: "restaurant"`. Google's [Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search) says that parameter does not apply to geopolitical queries. Therefore the new mapper guarantees venue-only output, but does not establish that a bare town name retrieves venues rather than a locality which is then filtered to an empty result. This is a documented residual risk, not a live Google failure reproduced in this review. After O4, explicitly test bare towns, restaurant names, cafés and bakeries before staging acceptance; revise destination-query construction if needed. Fixture-only green tests cannot close this point.

## Verified PR and CI state

[Draft PR #1](https://github.com/Bogdan0708/Safebite/pull/1) is open against `main` at the reviewed HEAD. GitHub reports `MERGEABLE` / `CLEAN`; it remains draft. Local HEAD and the remote-tracking branch agree, and the live PR head matches. GitGuardian and the web/functions check succeeded.

[Hosted run 35776065497](https://github.com/Bogdan0708/Safebite/actions/runs/35776065497) ran on this exact SHA. The web-and-functions job took **4 minutes 21 seconds**, within its 35-minute limit. Its logs show:

| Check | Hosted result |
| --- | --- |
| Typecheck | Pass |
| Web unit | 241 passed |
| Functions and rules | 260 passed |
| Emulator browser | 26 passed |
| Boot guard / preview / upgrade | 1 / 4 / 7 passed |
| Compile build, configuration refusals, fixture-identity refusal, synthetic builds and guardrails | Pass |

The previous lack of hosted-CI evidence for HEAD is **closed**. No test retry/failure summary was observed in this run's logs.

## Independent checks in this review

- Root `npm run typecheck`: pass.
- Root `npm run test:unit`: 241 passed.
- Targeted functions provider, provider-selection and endpoint tests: 30 passed.
- `git diff --check`: pass.
- Existing detail-state regression probes: both fail on this HEAD.
- Strengthened deletion probe: confirms the delete callback receives `new` after opening confirmation for `old`; cached-evidence probe also fails.

The full emulator/browser/build gate was verified from hosted logs on the exact SHA, rather than repeated locally. No real Places calls, deployments or iPhone/Safari acceptance were performed. O4 and coordinated functions/rules/hosting deployment remain owner-controlled staging prerequisites.

## Evidence and next step

`pre-merge-review-probes/detail-states.test.tsx.txt` and `pre-merge-review-probes/unit-output.txt` preserve the current-head diagnostic and output. Copy the source temporarily to `web/src/records/audit-premerge.test.tsx` and run `npm --prefix web test -- src/records/audit-premerge.test.tsx` to reproduce; remove the temporary source afterward.

Fix F1 and F2, add permanent regressions, then run the normal gate on the resulting commit and obtain hosted CI for that new SHA before marking ready. The URL mismatch can be fixed in the same small wave or tracked explicitly as P3.

Application code, existing AGENTS.md and previous untracked audit artifacts were left unchanged. Only this report and its diagnostic evidence were added, uncommitted. No PR mutation, commit, push, merge or deployment was performed.
