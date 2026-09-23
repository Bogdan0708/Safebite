# Pre-merge findings: fixes and verification

Base commit: `ef1934d2f32abc1d6581c3debc3c149da7b2eacd`.
At verification time on 2026-09-22, these changes were local and uncommitted. The earlier pre-merge review remains an unchanged record of the findings on that commit. The 2026-09-23 landing review separately records the owner-approved search-mode decision, legacy-client compatibility correction and fresh gate.

## Changes

### F1 — claim deletion identity

The latest evidence card is keyed by claim ID. A live replacement mounts a new card with no open confirmation, whether a newer claim arrives or deleting the latest exposes an older claim. Permanent component regressions cover both transitions. A browser regression inserts replacement evidence through the emulator, checks that both documents survive until a new explicit confirmation, then verifies only the intended claim was deleted.

### F2 — cached evidence disclosure and offline controls

The detail page shows one offline notice whenever either displayed snapshot is cache-backed. Independent loading, error and denied notices remain visible. Tests cover both mixed ready/offline states, both offline, empty cached claims, and returning online. Existing claim and restaurant deletion confirmations now become disabled when their snapshot becomes offline; Cancel remains available. Opening the cached restaurant form is still allowed, but Save/Delete remain disabled and repository transactions reject offline writes.

### P3 — URL validation matches stored spelling

The shared validator requires an explicit HTTP(S) prefix before parsing and rejects slash/backslash spellings that `URL()` would silently repair. Both form normalizers continue lowercasing valid uppercase schemes. Fourteen unit cases cover malformed restaurant websites and claim source URLs. The browser regression checks field errors without persisted records, then corrects both URLs and verifies successful saves and normalized links. No rules or schema change was required.

### Destination-search request construction

Discovery now asks for explicit intent: **Town or area** (default) or **Restaurant or venue name**. Changing the selector retains the draft without making a request. The optional callable `mode` defaults to `destination` for callers that omit it; invalid values are rejected before usage or provider work.

Destination mode sends `food in <query>` to Google; venue mode preserves the entered query. Both make one request, with the existing result cap, minimal field mask, timeout and household usage guard. The restaurant-only request filter is removed; the mapper independently retains restaurants, cafés, bakeries, bars and takeaways. Actual café-only and other allowed-type cases are now tested. The ranking note describes this filtering accurately.

This addresses the request-construction gap without guessing whether a text string names a town or a business. Google's [Text Search documentation](https://developers.google.com/maps/documentation/places/web-service/text-search) explains that `includedType` does not apply to geopolitical queries. Real Google relevance remains an owner-controlled acceptance check after O4; mocked responses cannot prove the live results.

README and spec §3.6 describe the new contract and acceptance boundary. No credentials, provider data storage, security rules or legacy Swift files changed.

## Agent implementation and independent review

- One agent implemented detail-page fixes and tests, then independently reviewed the other agents' URL/discovery changes and the parent's browser regressions.
- A second agent implemented URL validation, frontend search-mode propagation and the related restaurant confirmation fix.
- A third agent checked official provider documentation and implemented backend search modes, validation and adapter tests.
- The parent integrated browser coverage, documentation and the combined gate.

Tests were written first: six detail regressions, fourteen URL cases, four frontend mode assertions, thirteen backend regressions and the restaurant offline-confirmation regression failed before their respective fixes. The independent final scoped review reported no remaining finding in these changes. This review does not supersede staging/device acceptance.

## Verification

Results below apply to the final local application changes, with retries disabled in local emulator/browser suites.

| Check | Result |
| --- | --- |
| Functions and web typecheck | Pass |
| Web unit | 270 passed |
| Functions and Firestore rules, demo emulators | 280 passed |
| Emulator browser | 29 passed, retries disabled |
| Boot guard / preview / service-worker upgrade | 1 / 4 / 7 passed |
| Functions compile and web compile-only build | Pass |
| Three fresh synthetic bundles and provenance checks | Pass |
| Unconfigured build / non-production bypass / fixture override refusals | Pass, each rejected for the expected reason |
| Production-project, browser storage/key and secret-value guardrails | Pass |
| Ignored local fixture secret; AGENTS.md and legacy Swift unchanged | Pass |
| `git diff --check` | Pass |

## Remaining release steps

At the time of this verification, hosted CI run `35776065497` covered the base commit only. The fix commit requires its own green hosted CI before merging. No commit, push, PR mutation, merge, deployment or paid Places request was performed during this verification pass.

After O4, test bare towns/areas and named restaurants/cafés/bakeries with the corresponding mode against the real provider. Coordinate functions and hosting so the updated client has the new callable semantics, alongside the existing rules-deployment requirement. Real-device Safari and the later plans' acceptance work remain separate.
