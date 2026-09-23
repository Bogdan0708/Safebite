# Plan 3 independent review

Reviewed HEAD: `7e90e7473769f3fbbdba54dcc2c6ec6b94371f53` on `worktree-pwa-01-foundation`.
Plan 3 application changes were reviewed against `a0ec809`, alongside §2.5/§2.6/§3.6, the execution ledger, and the earlier records/auth/worker integration.

## Verdict

**Changes requested.** Three new P2 code findings are below. There is also an unsupported Places-retention premise to resolve before enabling the real provider. The existing gate passes independently; it does not cover these cases. No P0/P1 code defect was identified within the reviewed scope.

`898d2a8..7e90e74` changes only the execution ledger, so the reported gate and final application tree agree. GitHub was checked read-only: draft PR #1 remains open against main at `17ebe57476010f856feb5c1a614c27b57ef93121`, not the audited HEAD. No hosted-CI result for this HEAD was established. No push, merge, deployment, real Places request, or secret change was performed.

The earlier Plan 2b report remains untracked and unchanged. Its two P2 findings (delete confirmation transferring to a replacement claim; cached claims without an offline notice) and P3 URL-validation mismatch remain in source. They were not fixed by Plan 3, and the previous reproductions were not rerun in this review.

## F1 — P2: a pending location request outlives the search intent and page

Location: `web/src/discover/DiscoverPage.tsx:87–92`.

The request sequence starts inside `submitNearby`, after `requestPosition()` resolves. The await itself has no generation or unmount check. Consequently an older Near me action becomes a newer search merely because its geolocation callback arrives later. The search controller's cancellation on unmount cannot help: the stale callback starts a fresh submission afterward.

Reproduced in component tests and Chromium with a deferred geolocation callback and real emulator callables:

1. Tap Near me and leave its position unresolved.
2. Submit a newer text search (`__empty__` in the fixture); wait for its empty result.
3. Resolve the old position. A `searchNearby` POST occurs and ten nearby results replace the newer result.
4. In a separate case, leave Discover for Settings before resolving the position. A `searchNearby` POST still occurs; the emulator processes it successfully and consumes a search allowance.

This also applies to a late location failure: `fail()` can replace a newer successful result.

Correction: create a search-intent generation before requesting location; invalidate it on every new text/Near me intent and on unmount; discard stale successes and failures before they call the controller. Keep the existing callable sequence checks. Retain regressions for both supersession and unmount, not just two already-issued callable requests.

## F2 — P2: unsaved Places data persists in browser history

Location: `web/src/discover/DiscoverPage.tsx:95–97`; consumption at `web/src/records/RestaurantFormPage.tsx:45–47`.

Passing the complete prefill as BrowserRouter navigation state serializes the Google-derived name/address into `window.history.state`. This is not component-only memory. The CI grep for localStorage/sessionStorage/indexedDB does not detect it.

Chromium reproduction: search, choose Add to our records, do **not** press Save, confirm the emulator restaurant collection is empty, then reload. The form still shows the prefill and history contains:

```json
{"usr":{"prefill":{"name":"Fixture Trattoria","address":"1 Fixture Street, Testville","googlePlaceId":"fixture-01"}}}
```

This contradicts §3.6's no-storage/memory-only promise and the form's statement that only saved data is stored. Browser history also has no application-owned expiry/clear-on-signout mechanism here. This finding does not assert that another account was shown the prefill; the reproduced behavior is retention across reload without Save.

Correction: transfer the unsaved prefill through an ephemeral, auth-scoped in-memory handoff, using only an opaque reference in navigation if needed. Clear it on cancel/save/signout/unmount as appropriate, and test reload/history behavior. The browser diagnostic deliberately asserts the current retention before failing its intended invariant; adapt it into a normal regression after the fix.

## F3 — P2: destination search is an unrestricted place lookup

Location: `functions/src/discovery/googleProvider.ts:75–76`; permissive mapping at lines 29–34.

The UI invites a town/area search and presents the output as restaurants, but the Google request for `Lisbon` is just `{textQuery:"Lisbon",maxResultCount:10}`. It has neither a restaurant-oriented query nor a type restriction. The mapper also keeps results with no businessStatus. The fixture always returns invented restaurants, masking the difference.

An offline adapter probe captured that exact request and supplied a synthetic locality response with an id, name and address but no businessStatus. The adapter returned the locality as an ordinary discovery result. This proves the missing filtering and accepted response shape; it is **not** evidence of a live Google response for Lisbon.

Google documents Text Search as returning matches to the supplied text, including addresses and non-restaurant places. Type restrictions are explicit options; strict filtering has caveats for geopolitical queries. The design must express restaurant-search intent rather than assuming a town name means restaurants in that town. [Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search#textquery)

Correction: define the destination-versus-named-restaurant semantics, construct a restaurant-oriented request, and enforce the intended category. Add negative provider cases for localities and other non-restaurants. Verify real response semantics during authorised staging; copying the present request shape into a test is insufficient. The design and implementation currently share this gap.

## S1 — Staging/design blocker: the claimed user-saved storage exception is unverified

Location: `planning/specs/2026-09-20-safebite-pwa-design.md:646–649,671`; persistence at `web/src/records/RestaurantFormPage.tsx:93–104`.

The spec treats pressing Save on Google's name/address as converting it into unrestricted household data. I could not verify that exception in the current official terms. Standard terms §3.2.3 explicitly restrict saving business names/addresses and caching; the Places-specific exception covers limited coordinate retention, while place IDs have a separate exemption. [Standard terms](https://cloud.google.com/maps-platform/terms), [service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Places policy](https://developers.google.com/maps/documentation/places/web-service/policies)

Billing jurisdiction and any negotiated agreement are unverified. EEA terms and permitted uses differ, but the reviewed material does not establish the claimed blanket user-save exception. [EEA service terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms), [EEA permitted uses](https://cloud.google.com/terms/maps-platform/eea-places-api-permitted-uses)

Resolve the applicable permission before real-provider staging. Either document the permission supporting this exact retained/shared/exportable data flow, or revise the design to keep permitted identifiers and independently supplied household data. A Save button alone is not evidence of a licence exception. This is an unresolved integration prerequisite, not a claim that the fixture tests contacted Google or a definitive legal determination about the owner's agreement. It also matters before Plan 4/5 build offline/export behavior around these records.

## Lower-priority observations and rejected hypothesis

- **Provider logging test mismatch:** the mock sees `message: err.message.slice(0,200)`, but installed `firebase-functions/logger` overwrites that property with the positional `"discovery.search"` message. A probe using the real logger confirmed that an echoed-query marker was absent from serialized output. Therefore the suspected privacy leak is **not reported as an active defect**. Provider diagnostics are also discarded, and the mocked truncation test does not prove the production log contract. Prefer fixed diagnostic codes/status and assert real serialized output; do not simply rename the field and start logging provider-echoed queries.
- **Pricing fact:** §3.6 states 10,000 free requests per SKU; Google's current global list shows **5,000** for both Text Search Pro and Nearby Search Pro. The single household's 50/day cap remains below that volume by itself, but billing-account usage is aggregated. Correct the design's factual claim. [Current pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- **Fixture provenance:** `functions/test/fixtures/places-searchText.json` contains synthetic `ChIJfixture...` identifiers and sample data. It verifies mapping but does not substantiate the spec's claim of a recorded real response. The real adapter has not been exercised against Google in this review.
- Structural abort-name checks are appropriate for the demonstrated cross-realm tests. Explicit callable region/maxInstances, the expanded REST field decoder, and the CI timeout change are present. CI-only test retries do not affect this review's successful local no-retry run.

## Independent validation

| Check | Result |
| --- | --- |
| Root typecheck (functions/tests, web app/node/e2e) | Pass |
| Existing web unit suite | 234 passed |
| Existing functions/rules emulator suite | 256 passed, local retries off |
| Root compile-only build | Pass |
| Fresh synthetic preview/v2/boot builds | Pass |
| Boot guard / preview / upgrade | 1 / 4 / 7 passed |
| Existing emulator browser suite | 23 passed, retries off, about 1.8 minutes |
| New geolocation component probes | Two expected failures |
| New browser probes | Three expected failures: both location cases and prefill retention |
| Provider request/mapping and real-logger probe | Observations recorded; no network/database calls |
| Production-id, storage, API-key-shape and secret-value CI greps | Pass |
| Local secret ignored and verified to select fixtures | Pass; secret contents not exposed |
| Tracked diff whitespace | Pass |

The reported 69-run stress result was not repeated. Hosted CI on this HEAD, real Google behavior, iPhone/Safari acceptance, billing/key restrictions and deployed configuration remain unverified. Owner action O4 is still necessary, but it is not the only staging prerequisite given S1 and the outstanding code findings.

## Reproduction artifacts

`planning/audits/plan-3-review-probes/` preserves:

- `geolocation.test.tsx.txt`: copy to `web/src/discover/audit-plan3.test.tsx`, then run `npm --prefix web test -- src/discover/audit-plan3.test.tsx`. The original run included the twelve existing page tests as controls; the preserved source retains the two new probes and shared setup. `geolocation-output.txt` records the failures.
- `browser.spec.ts.txt`: copy to `web/e2e/audit-plan3.spec.ts`; with the fixture secret and built functions, use the command below. `browser-output.txt` records the three failures. These diagnostic probes demonstrate current behavior before asserting the violated invariant.
- `provider-probe.cjs`: run from repository root after building functions with `node planning/audits/plan-3-review-probes/provider-probe.cjs`. Uses a fake fetch and database object but the actual adapter/search/logger. `provider-output.txt` records the result.

```bash
FUNCTIONS_DISCOVERY_TIMEOUT=90 ./node_modules/.bin/firebase emulators:exec \
  --only auth,firestore,functions --project demo-safebite \
  'node functions/lib/seed-emulator.js && npm --prefix web run e2e -- audit-plan3.spec.ts --retries=0'
```

Browser fixtures reset disposable emulator records/config/usage. Remove temporary test copies after running; files under web/src change the synthetic provenance hash. All temporary copies were removed after this review. Tracked application/rules/config files and AGENTS.md remain unchanged. This report and its evidence are left uncommitted; prior untracked audit artifacts were preserved.
