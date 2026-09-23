# SafeBite PWA — design spec and plan audit

**Date:** 2026-09-20
**Status:** Draft for owner review. Nothing in this document has been implemented.
**Supersedes:** the pasted "Proposed Plan" (SafeBite → private iPhone web app for Ava).

This document has three parts:

1. **Audit of the proposed plan** — every technical claim re-checked against the
   repository, with corrections.
2. **Design spec** — the binding authority for implementation plans.
3. **Decomposition** — five sequential implementation plans sized for
   `superpowers:subagent-driven-development`, plus the owner-only prerequisites
   that agents must never perform.

---

## Part 1 — Audit of the proposed plan

### 1.1 Verification method

- Git history, tracked files, manifests, Firebase config, rules, seed script and
  localisation files inspected directly.
- Sixteen code-level claims verified by two read-only explorer agents with
  file:line evidence (source root `SafeBite/SafeBite/`).
- Three external claims re-fetched from the cited pages on 2026-09-20.
- Firebase CLI and GitHub remote probed read-only.

### 1.2 Claims confirmed (with corrected evidence locations)

| # | Plan claim | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Missing Google key silently returns sample restaurants | Confirmed | `Features/Map/MapFeature.swift:326-331` and `:360-366` return `mockRestaurants` when `apiKey.isEmpty` |
| 2 | Score ≥80 infers coeliac suitability | Confirmed | `Models/Restaurant.swift:313-315` `isCeliacSafe = safetyProfile.isCeliacSafe \|\| trustScore.total >= 80`; also `SavedFeature.swift:388`, `MapFeature.swift:434`; UI copy "Verified safe for coeliacs" at `RestaurantDetailView.swift:253-254` |
| 3 | Both manifests define libraries; no Xcode project, entitlements, privacy manifest | Confirmed | root and `SafeBite/Package.swift` both `.library`; `find` for `*.xcodeproj`, `*.entitlements`, `PrivacyInfo.xcprivacy` returns nothing. **Note:** the remote commit `a3403d1` adds an `Info.plist`, not a project |
| 4 | Map binding type mismatch | Confirmed | `MapView.swift:77` binds `$store.cameraPosition.sending(\.regionChanged).mapPosition`; action payload is `MKCoordinateRegion`, `.mapPosition` is a function (`:377-380`) |
| 5 | "View details" handler empty | Confirmed | `MapView.swift:61` `onViewDetails: { /* Navigate to detail */ }` |
| 6 | Detail reducer loads nothing; save only mutates state | Confirmed | `RestaurantDetailFeature.swift:63-68` and `:104-107` |
| 7 | One review flow simulates success | **Location wrong** | Simulation is in `Features/Review/ReviewFeature.swift:162-168`, a feature not instantiated anywhere except its own preview. `RestaurantDetailFeature.swift:330` is the **empty `userId`** claim, and that flow does call `FirestoreService.submitReview` (`:345`) |
| 8 | Empty user ID supplied | Confirmed | `RestaurantDetailFeature.swift:330` and `:473` `userId: ""` |
| 9 | Review/incident services attempt admin-only restaurant updates | Confirmed | `FirestoreService.swift:99-121` (transaction on `restaurants/{id}`), `:210-214`; rules allow restaurant update only if `isAdmin()` |
| 10 | Rules allow client-supplied verification flags; weak update validation; incidents readable by any user | Confirmed | `firestore.rules:82-86` (no restriction on `isVerifiedReviewer`), `:89-91`, `:101-103` |
| 11 | GDPR deletion is local + sign-out only | Confirmed | `GDPRFeature.swift:227-243` calls `signOut()`, never `deleteAccount()` |
| 12 | Account deletion queries wrong saved-restaurants collection | Confirmed | `AuthenticationService.swift:351-355` queries top-level `savedRestaurants`; writes go to `users/{uid}/savedRestaurants` (`FirestoreService.swift:147-175`) |
| 13 | Export covers only some local data | Confirmed | `PersistenceService.swift:197-214`; omits `IncidentReport` and all cloud data |
| 14 | Analytics consent defaults on; toggles don't control Firebase | Confirmed | `GDPRFeature.swift:23,76-80` default `true`; `saveConsentSettings` (`:244-252`) writes UserDefaults only; no `setAnalyticsCollectionEnabled` anywhere. **Inconsistency:** `Models/User.swift:95` defaults `false` |
| 15 | Google key remains in an old commit | Confirmed | `git show e7c0268:SafeBite/SafeBite/Config.swift` line 6 literal `AIza…`; absent from HEAD |
| 16 | Saved sync unscoped; deletions unreconciled; cloud import 0,0 | Confirmed | `SavedRestaurantEntity` has no owner field (`PersistenceService.swift:220-330`); `SavedFeature.swift:343-347` local remove only; `:385-386` `latitude: 0, longitude: 0` |
| 17 | Single geohash cell; seed lacks geohash; Details uses search field mask | Confirmed | `FirestoreService.swift:30-40`; `grep geohash scripts/seed-firestore.js` = 0; `GooglePlacesService.swift:121` uses `places.`-prefixed mask on `places/{id}` |
| 18 | Seed data invents verifiers and targets production project | Confirmed | `scripts/seed-firestore.js:67` `verifiedBy: 'Sarah Jones, RD'`, `:291`, `:235`; `projectId: 'safebite-production-13ba1'` at `:22,28,34,488` |

### 1.3 Claims corrected or added

| Topic | Proposed plan said | Verified reality |
|-------|-------------------|------------------|
| GitHub remote | "check failed because of network resolution" | Reachable. **Remote `main` is one commit ahead of local:** `a3403d1` (2026-01-17) "Add legal pages, app icon, and Info.plist for App Store deployment" adds `docs/index.html`, `docs/privacy-policy.html`, `docs/terms-of-service.html`, `SafeBite/SafeBite/Info.plist`, app icon. Local must fast-forward before any new work. The `docs/` folder is a GitHub Pages site, so internal planning documents live in `planning/` (decision O7, taken 2026-09-20: `docs/` stays the Pages site) |
| Development period | 9–28 Dec 2025 | 9 Dec 2025 – 17 Jan 2026 (including remote). No commits since 17 Jan 2026 |
| File counts | 33 files, ~12,000 lines | 37 unique Swift files, 11,986 lines under `SafeBite/`; 43 files / 13,697 lines if the byte-identical root `SafeBiteTests/` duplicate is counted |
| Tests | 53 methods, 4 suites | Confirmed (duplicated in two directories) |
| Localisation | 5 × 127 keys | Confirmed |
| CI | none | Confirmed (`.github/` absent) |
| Duplicate config | not mentioned | `.firebaserc`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `scripts/*` exist byte-identically at repo root **and** under `SafeBite/`; 12 compiler-cache files are tracked under `.clang-module-cache/` |
| Firebase access | "unverified" | CLI is logged in as the owner account but the OAuth token is expired (`401` on `projects:list`). Inventory needs `firebase login --reauth` by the owner |
| Local toolchain | not mentioned | Node 22.20.0, npm 10.9.3, firebase-tools 14.27.0 (global; 15.30.2 current), gcloud present, Swift 5.10 (no SwiftUI). **Java is not installed**, so Firebase emulators cannot run until a JDK is installed |
| Apple SDK requirement | iOS 26 SDK from 28 Apr 2026 | Confirmed from the Apple notice (dated 3 Feb 2026) |
| Firebase Apple SDK | 12.12.0 requires Xcode 26.2 / Swift 6.2.3 | Confirmed; latest is 12.19.2 (17 Sep 2026). Repo pins 11.15.0 |
| Places policy | "24-hour caching allowed" assumption inadequate | Confirmed. Policy page: only the **place ID** may be stored indefinitely; attributions must be shown; when Places data is shown without a Google map, the Google logo is required |
| Current rules privacy | not mentioned | `restaurants`, `reviews`, `trustScores` are `allow read: if true` — the existing backend is public-read, incompatible with a private household app. New rules must be written from scratch, not adapted |

### 1.4 What the proposed plan needed for agent-driven execution

The pasted plan is a good product brief but is not executable by subagents:

- It is one monolith; subagent-driven development needs plans whose tasks each
  end in an independently testable commit.
- It mixes owner-only actions (create/inspect Firebase project, revoke keys,
  enable billing, deploy) with agent work. Agents must never do those.
- It has no global constraints block, no file map, no interfaces between tasks,
  and no test code — all required by `superpowers:writing-plans`.
- It has no guardrails against the specific hazards found above (production
  project name in config, invented safety claims in seed data).

Part 3 fixes this.

---

## Part 2 — Design spec

### 2.1 Product

An invite-only, English-only progressive web app for two accounts (Ava and the
owner), used in Safari and from the iPhone Home Screen. It helps organise
restaurant research while travelling.

**In scope (v1):**

- **Discover** — search by destination text, or explicitly request nearby
  results. List with filters, external directions link. Nothing loads without an
  explicit submission.
- **Understand** — independently sourced facts per restaurant: dedicated
  kitchen, separate fryer, preparation practices, accreditation, GF menu. Every
  fact carries a source link/description and a checked date; unknown stays
  unknown. No numerical score. "Call ahead and ask" prompts on every detail page.
- **Save together** — one shared shortlist per household; visited state;
  per-member authored notes.
- **Travel offline** — opt-in download of first-party saved data and notes for
  reading in airplane mode. Search and edits require connectivity.
- **Manage data** — export household data (with authorship), delete own account
  and contributions, clear downloaded device data.

**Explicitly deferred:** public registration, public reviews, incident
reporting, subscriptions, reviewer quiz, photo uploads, embedded maps, automated
safety assessment, analytics, localisation beyond English, native iOS.

**Non-negotiable rules:**

- Google ratings or past visits never produce a safety label.
- An accreditation label requires an identifiable accrediting source; an
  ordinary note cannot grant one.
- Interacting with a restaurant or adding a note never refreshes a
  verification date.
- Expired evidence is displayed as "needs rechecking", never hidden and never
  treated as current.
- Never fall back to sample venues when a provider fails.

### 2.2 Architecture

```
iPhone Safari / Home Screen PWA
   │  Firebase Auth (email+password, pre-provisioned)
   │  Firestore (household-scoped, rules-enforced)
   │  Callable Cloud Functions (europe-west2, Node 22)
   ▼
Firebase project (pilot, EU region)   ──►   Google Places API (New)
                                              (server key, never in browser)
```

- **Web:** Vite + React + TypeScript in `web/`. React Router for navigation.
  Firebase JS SDK v12. `vite-plugin-pwa` for the app shell. Vitest + Testing
  Library for unit tests, Playwright for browser tests.
- **Backend:** `functions/` — TypeScript, `firebase-functions` v7 (v2 API),
  `firebase-admin`. All paid or identity-sensitive operations are callables that
  derive identity from `request.auth`, never from submitted IDs.
- **Data:** Firestore. Rules default-deny; membership is admin-written only.
- **Local development:** Firebase emulators with the `demo-safebite` project ID
  (the `demo-` prefix makes the CLI refuse to touch any real project).
- **Swift project:** kept untouched as reference. Only tracked compiler caches
  and duplicated backend config are removed.

### 2.3 Data model

All household data lives under `households/{householdId}`.

| Path | Fields | Written by |
|------|--------|-----------|
| `users/{uid}` | `householdId`, `displayName` | admin only |
| `households/{hid}` | `name`, `memberIds: string[]`, `createdAt` | admin only |
| `households/{hid}/restaurants/{rid}` | `name`, `address`, `lat`, `lng`, `googlePlaceId?`, `phone?`, `website?`, `createdBy`, `createdAt`, `updatedAt`, `version` | members via rules |
| `households/{hid}/restaurants/{rid}/claims/{cid}` | `kind` (`dedicatedKitchen`, `separateFryer`, `trainedStaff`, `gfMenu`, `preparationPractice`, `accreditation`), `value` (`yes`/`no`/`partial`), `detail`, `source: {type: 'restaurantStatement'|'accreditingBody'|'ownVisit'|'thirdParty', label, url?}`, `checkedAt`, `expiresAt?`, `authorUid`, `createdAt` | members via rules; accreditation kind validated by rules to require `source.type == 'accreditingBody'` and non-empty `source.url` |
| `households/{hid}/collection/{rid}` | `restaurantId`, `savedBy`, `savedAt`, `visited`, `visitedAt?`, `version` | members via rules |
| `households/{hid}/collection/{rid}/notes/{nid}` | `authorUid`, `text`, `createdAt`, `updatedAt` | author only |
| `config/discovery` | `enabled: boolean`, `dailySearchCap: number` | admin only (kill switch) |
| `households/{hid}/usage/{yyyymmdd}` | `searches`, `details` | functions only |

Discovery results (Places responses) are never written to Firestore or offline
storage. Only `googlePlaceId` persists.

### 2.4 Security model

- Two accounts pre-provisioned by the owner (staging) or by the emulator seed
  script (local). No sign-up UI, no self-registration path in rules.
- `isMember(hid)` = signed in AND `request.auth.uid in households/{hid}.memberIds`.
- Client writes are limited to restaurants, claims, collection entries and own
  notes within the caller's household, with field-level validation.
- Every callable begins with `requireMember(request)`.
- The Places server key is a Cloud Functions secret; never in `web/`.
- Optimistic concurrency: writes to `restaurants` and `collection` documents
  carry `version`; the rules reject a write whose `version` is not `resource.data.version + 1`.
  The client shows "someone else changed this — reload" on rejection.

### 2.5 Discovery and Places compliance

- Callables: `searchDestination({query, limit})`, `searchNearby({lat, lng, radiusM, limit})`,
  `placeDetails({placeId})`. Minimal field masks. Text search only on submit.
- Every response includes `attribution` text; the UI shows the Google logo where
  Places content appears and links results to their Google Maps listing.
- `config/discovery.enabled == false` → callables return `failed-precondition`,
  the UI shows "Search is switched off".
- Per-household daily cap enforced in the callable via `usage/{date}`.
- Client cancels superseded searches (AbortController + request sequence ids) so
  an old response never replaces a newer destination.
- States: empty results, location denied, provider unavailable, quota exceeded,
  offline. None of them shows sample venues.

### 2.6 Privacy, offline, operations

- No analytics, ads or behavioural tracking. Functions logs exclude note text
  and precise coordinates (log rounded to 2 dp only when needed).
- Offline: Firestore SDK persistence stays **off**. An explicit "Download for
  offline" action copies saved restaurants, claims and notes into IndexedDB
  with a download timestamp. Cleared on sign-out and on account deletion.
- Export: callable returns JSON of the household's restaurants, claims,
  collection and notes with `authorUid`/`displayName`.
- Account deletion: callable deletes the caller's notes, membership, user doc,
  and Auth record, in that order, idempotently; last member also deletes the
  household. The UI reports success only after the callable returns.
- Cost: `maxInstances` small, minimal field masks, daily caps, kill switch,
  budget alert configured by the owner. Target £10/month; not a guarantee.
- Legal pages: accurate privacy and terms pages describing actual providers,
  regions and retention; replace the remote `docs/` pages when the PWA ships.

### 2.7 Testing strategy

| Layer | Tool | Runs where |
|-------|------|-----------|
| Pure logic (membership, evidence expiry, search sequencing) | Vitest | `web/`, `functions/` |
| Firestore rules | `@firebase/rules-unit-testing` against emulator | `functions/test/rules/` |
| Callables | HTTP against functions emulator with emulator ID tokens | `functions/test/` |
| Browser flows | Playwright against Vite dev server + emulators | `web/e2e/` |
| CI | GitHub Actions: typecheck, unit, emulator suites, build | `.github/workflows/ci.yml` |

Real-iPhone acceptance (owner + Ava) happens after staging deploy, outside CI.

---

## Part 3 — Decomposition and execution model

### 3.1 Owner-only prerequisites (agents must never do these)

| ID | Action | Needed before |
|----|--------|---------------|
| O1 | `git pull --ff-only` to bring `a3403d1` into local `main` | Plan 1 |
| O2 | Install a JDK (21+) so Firebase emulators run locally | Plan 1 verification |
| O3 | `firebase login --reauth`; then inventory `safebite-production-13ba1` read-only (owners, Firestore location, deployed rules, users, billing, API restrictions). Record findings in `planning/specs/firebase-inventory.md` | Plan 5 staging |
| O4 | Check the historical key from commit `e7c0268` in Google Cloud Console: restrict or delete it. Create a **new** server key restricted to Places API (New) for the pilot project only | Plan 3 staging |
| O5 | Create a new Firebase project for the pilot (Firestore in `europe-west2`), Blaze plan with a budget alert at £10, add alias `staging` to `.firebaserc` | Plan 5 |
| O6 | Create the two member accounts in the pilot project's Auth and their `users/` + `households/` docs via console or admin script | Plan 5 |
| O7 | ~~Decide whether `docs/` remains a GitHub Pages site~~ Done: `docs/` stays public Pages; planning docs live in `planning/` | — |
| O8 | Approve this spec and Plan 1 | Any implementation |

### 3.2 Guardrails carried into every plan's Global Constraints

- Firebase project ID for all local work is `demo-safebite`. The string
  `safebite-production-13ba1` must not appear in any new file, with one
  path-scoped exception (ruling 2026-09-21): the deployability validator
  `web/src/config/firebaseEnv.ts` and its test name it only as a **rejected**
  value, and the CI guardrail grep excludes exactly those two files.
- A `vite build` must run with `NODE_ENV=production` (Vite's default); any other value,
  from the shell or a `.env` file, is refused before the compile-only bypass (re-audit fix,
  2026-09-21). A built bundle's startup guard keys on the `__SAFEBITE_BUILD__` define from
  `web/vite.config.ts`, never on `import.meta.env.PROD`, and `npm --prefix web run e2e:boot-guard`
  boots a compile-only bundle with demo values in Chromium to prove it refuses to start.
- No `firebase deploy`, no `git push`, no billing or console changes by agents.
- No API keys, service-account JSON or `.env.*` with real values committed.
- Never import the legacy `scripts/seed-firestore.js` data; its safety claims are invented.
- No numerical safety score anywhere in the new code.
- British spelling in UI copy ("coeliac").
- Node 22; TypeScript `strict: true`; lockfiles committed.

### 3.3 Implementation plans

Each plan is executed by `superpowers:subagent-driven-development` on its own
branch/worktree, reviewed, then merged before the next begins.

| Plan | Deliverable (independently testable) | Depends on |
|------|--------------------------------------|-----------|
| **1. Foundation and household auth** — `planning/plans/2026-09-20-safebite-pwa-01-foundation.md` | Repo hygiene; `web/` + `functions/` scaffolds; emulator-only config; new rules for `users`/`households`; `requireMember` + `whoami` callable; sign-in / not-invited / member shell; emulator seed; Playwright + CI. A member signs in and sees the shell; a non-member is refused; rules tests prove isolation | O1, O2 |
| **2. Restaurant records and evidence** | **PWA app shell first** (`vite-plugin-pwa` manifest, real icon set replacing the Vite logo, `apple-touch-icon`, `apple-mobile-web-app-capable`, `theme-color`, standalone display — a plan gap found in the Plan 1 final review); then `restaurants` + `claims` model, rules with accreditation validation and version checks, private editing form, evidence display with checked/expired states, "call ahead" prompts, unit + rules + e2e tests | Plan 1 — 2a, 2a-h and 2b executed 2026-09-21 (see §3.5 and `planning/plans/2026-09-21-safebite-pwa-02b-records.md`) |
| **3. Discovery through functions** | `searchDestination`, `searchNearby`, `placeDetails` callables with secret key, kill switch, caps, attribution; discover UI with all failure states; search cancellation; external directions links; "add to our records" from a result (stores place ID only) | Plan 2 — design in §3.6 (2026-09-22) |
| **4. Shared collection and notes** | `collection` + `notes` model and rules, save/unsave/visited, authored notes, optimistic concurrency with reload prompt, account-switch cache clearing, e2e | Plan 2 (Plan 3 optional) |
| **5. Privacy, offline, operations** | Opt-in offline download to IndexedDB, clear-on-signout, export callable, account-deletion callable, settings page, privacy/terms content, staging config files, cost-control checklist, real-iPhone acceptance script | Plans 1–4, O3–O6 |

Plans 2–5 are written after Plan 1 is executed and reviewed, so they can name
the real interfaces that landed rather than predicted ones.

**Plan 2 pre-work carried from the Plan 1 final review (2026-09-20):**

- Done in Plan 2a: Dedupe the Settings page's `whoami` call (ref/AbortController) so React StrictMode's
  double effect issues one request; then drop the global 15 s Playwright `expect` timeout
  and the doubled emulator warm-up in `web/e2e/global-setup.ts`.
- Done in Plan 2a: Switch the household read rule to `request.auth.uid in resource.data.memberIds` (no
  extra `get()`), keeping `isMember(hid)` for subcollections.
- Done in Plan 2a: Type-check `functions/test/**` (a `tsconfig.test.json`), add `.gitattributes`
  (`* text=auto eol=lf`), make the 60 s vitest timeouts conditional on `CI`.
- Done in Plan 2a: Unit-test the auth provider's generation-counter race and unsubscribe-on-unmount.
- Before staging: supply `VITE_FIREBASE_*` build-time values, add the `staging` alias,
  confirm `europe-west2`, set the £10 budget alert (owner actions O3–O6).

**Added from the Plan 1b final review (2026-09-21):**

- Done in Plan 2a: a misconfigured bundle renders `MisconfiguredScreen` from `web/src/main.tsx`
  before any Firebase import, unregisters service workers, and never registers one; the
  module-scope guard in `web/src/firebase.ts` remains as the second line. Any deploy job must
  call `npm --prefix web run build` (validated), never the root `build` (compile-only).
- Done in Plan 2a: Add shape checks to the validator (api key starts `AIza` and ≥ 30 chars; app id matches
  `^\d+:\d+:web:[0-9a-f]+$`; auth domain contains a dot) so junk-but-non-blank values fail.
- Done in Plan 2a: Scope the 15 s Playwright `expect` timeout to the two `whoami` assertions (or raise the
  per-test timeout) once the Settings `whoami` call is deduplicated.
- Done in Plan 2a: Establish request cancellation (`AbortController`) on the Settings page's callable before
  Plan 3 adds paid discovery calls (spec 2.5 requires cancellation).

**Carried from the Plan 2a final review (2026-09-21), for Plan 2b/3/5:**

- Done in Plan 2a-h (audit P2): non-deployable builds emit the plugin's self-destroying worker;
  the misconfigured page purges registrations and all caches and reloads once if it was still
  controlled; `web/e2e-upgrade` proves valid→invalid and valid→valid same-origin upgrades.
- `abortable()` discards `signal.reason`, so an `AbortSignal.timeout()` reports as a user abort;
  preserve the reason and add a timeout companion before Plan 3 adds per-request timeouts.
- Done in Plan 2b: The service worker is `registerType: "autoUpdate"`, which reloads the page
  unannounced when a new version activates. Add an `onNeedRefresh` "new version — reload" prompt
  when the first real form lands (Plan 2b's editing form), so an update never discards
  half-typed input.
- `pwa-192.png`/`pwa-512.png` (purpose `any`) bake rounded corners in; the maskable variant is
  correct. Decide with the owner whether the `any` icons should be square before Plan 5.
- Done in Plan 2b: CI now runs six `vite build`s and four Playwright configurations in one
  25-minute job with `retries: 0` on the preview suite; if it starts timing out or flaking, those
  are the dials. The `e2e:upgrade` script rebuilds `dist-preview`; factoring the synthetic env
  sets into a committed `.env.e2e`-style file is Plan 2b pre-work.
- `navigateFallbackDenylist: [/^\/__\//]` is set; confirm on staging (Plan 5) that
  `/__/auth/handler` is reachable if `authDomain` ever shares the app's origin.

**Carried from the Plan 2a-h final review (2026-09-21), for Plan 2b:**

- Done in Plan 2b: The `onNeedRefresh` update prompt (above) is now the only remaining worker item
  and must land before the first editable form; when it does, the valid→valid test in
  `web/e2e-upgrade` (which assumes autoUpdate reloads on activation) must be updated in the same
  task.
- Done in Plan 2b: `e2e:upgrade` rebuilds `dist-preview` that `e2e:preview` already built; factor
  the synthetic `VITE_*` sets (which are shape-valid fake keys) into a committed
  `web/.env.e2e`-style file loaded by the scripts, so they stop being inlined in `package.json`
  and rebuilt twice.
- Done in Plan 2b: A non-deployable build still emits `manifest.webmanifest` and the manifest
  link, so a misconfigured artefact is nominally installable; suppress the manifest for
  self-destroying builds if such builds are ever served deliberately.
- Done in Plan 2b: The precache manifest lists four icon/manifest URLs twice (same revision;
  harmless); cleanup.

**Plan 2 rulings (owner, 2026-09-21):**

- Plan 2 is split: **2a** = the pre-work list above, the PWA app shell (manifest, icon set,
  Apple meta tags, standalone display), a plain "this build is misconfigured" screen in place
  of the module-scope throw, and service-worker safeguards; **2b** = `restaurants` + `claims`
  model, rules, private editing form, evidence display. Each is reviewed and audited on its own.
- `restaurants.lat`/`lng` and `googlePlaceId` are optional until Plan 3 fills them from Places;
  the Plan 2b form asks only for name and address (phone/website optional). Rules accept absent
  coordinates and validate them as numbers in range when present.
- Evidence expiry: a claim with no `expiresAt` is shown as "needs rechecking" 12 months after
  `checkedAt`. An explicit `expiresAt` (for example from an accrediting body) takes precedence.
  Computed in one pure function shared by the UI and its tests; never stored.
- App icon: a simple monochrome SafeBite mark kept as SVG in the repo and rasterised to the
  required PNG sizes by a script, so the owner can replace the artwork later without code changes.

### 3.4 Decisions taken without owner input (override if wrong)

| Decision | Reason | Cost if wrong |
|----------|--------|---------------|
| Email + password sign-in, no Sign in with Apple in v1 | Two known users; Apple sign-in needs Apple developer config the PWA does not otherwise need | Small: add provider later |
| New Firebase project for the pilot rather than reusing `safebite-production-13ba1` | Existing project holds public-read rules and possibly seeded invented data; its state is unverified | Owner pays for a second project's negligible free tier |
| Legacy `scripts/` seed and duplicate `SafeBite/` config copies are deleted in Plan 1 | They target production and contain invented claims; git history keeps them | Nothing — recoverable from history |
| Firestore SDK offline persistence off; explicit IndexedDB download instead | Makes "opt-in", "exclude provider data" and "clear on sign-out" provable | More code in Plan 5 |
| No npm workspaces; `web/`, `functions/` and a thin root `package.json` | Firebase deploy packages `functions/` standalone; hoisted deps break it | Slightly more `npm ci` steps in CI |
| Optimistic concurrency by integer `version` enforced in rules | Meets "reject stale versions, offer reload" without server round-trips | None foreseen |

### 3.5 Plan 2b design — restaurant records and evidence (brainstormed 2026-09-21, revised after the design audit the same day)

Owner rulings taken during the brainstorm (all six recommendations accepted; the design audit
`planning/audits/2026-09-21-plan-2b-design-audit.md` found seven mechanism gaps, F1–F7, which this
revision closes without changing the six rulings):

1. The **Saved** tab lists the household's restaurant records until Plan 4 layers visited
   state and notes on top. Routes: `/restaurants`, `/restaurants/new`, `/restaurants/:rid`,
   `/restaurants/:rid/edit`, `/restaurants/:rid/evidence/new`. `/saved` redirects to
   `/restaurants`. The `nav-saved` testid and "Saved" label stay.
2. **Claims are immutable documents.** Members add and delete claims; the rules refuse
   `update`. Evidence is corrected by adding a new claim and deleting the old one. A deleted
   claim is gone; this is not an audit trail.
3. **Restaurants can be deleted** by any member after an in-page confirm step (a second
   "Yes, delete" button, never `window.confirm`, which would block browser tests). Deletion
   follows the protocol below so no claim is orphaned.
4. **Live data.** `onSnapshot` listeners for the list, the detail page and its claims.
   Firestore SDK offline persistence stays off (spec 2.6); the memory cache is unavoidable and
   is handled explicitly (see "Online-only writes and read states").
5. **Update prompt.** A non-modal banner with a **Reload** button, rendered above every screen;
   a tab reloads only when *that tab's* Reload is tapped (see "Pre-work").
6. **Scope fence.** In: the four pre-work items below, the model, rules, form, detail page with
   "call ahead and ask" prompts, unit, rules and browser tests. Out: the `abortable()`
   `signal.reason` fix (Plan 3 pre-work), the square-icon question (Plan 5), anything Places,
   any change under `functions/src` (everything here is client + rules).

#### Pre-work (worker and build hygiene)

- **Prompt-mode worker with per-tab reload (F5).** `registerType: "prompt"`.
  `registerServiceWorker()` passes `onNeedRefresh` and `onNeedReload` and keeps the returned
  `updateServiceWorker` function. A small external store in `web/src/pwa/updates.ts`
  (`subscribe`, `getSnapshot`, `applyUpdate`) feeds `<UpdateBanner>` in `App` via
  `useSyncExternalStore`, outside the router so it shows on the sign-in screen and in the shell.
  Store states: `idle` → `available` ("A new version of SafeBite is ready", Reload) →
  `activated` ("SafeBite was updated in another tab. Reload when you are ready.", Reload).
  Tapping Reload calls `applyUpdate()`, which records `requestedHere = true` and calls
  `updateServiceWorker()`. The plugin's `onNeedReload` fires in **every** open tab when the new
  worker takes control (audit reproduction: the default handler reloads them all); ours reloads
  only if `requestedHere`, otherwise it moves the store to `activated`. Tapping Reload in
  `activated` calls `window.location.reload()`. Old-version tabs keep working: the app imports
  its only lazy chunk (`App`) at boot and no route is lazy, so an old tab needs nothing from the
  evicted precache until it navigates or reloads. Misconfiguration recovery (Plan 2a-h purge and
  one-shot reload) is unchanged and exempt from "nothing reloads until tapped".
- **Upgrade tests (F5).** The `e2e-upgrade` valid→valid test is rewritten: install v1, type into
  the sign-in email field, serve v2, trigger the update check, assert the banner is visible, the
  typed value intact and the entry chunk still v1; tap Reload; assert the v2 entry chunk, one
  registration, controlled, old chunk evicted. A new **same-context two-tab test**: tabs A and B
  on v1, B holds typed text; A taps Reload; A reaches v2 while B stays on v1 with its text and
  shows the `activated` banner; B taps Reload and reaches v2. The sign-in field is the only form
  reachable without emulators and stands in for a draft; the dirty-restaurant-draft behaviour is
  covered by unit tests (form keeps its draft and base version while the store changes state).
  The purge test's "reloads exactly once" wording is tightened to what it asserts (session flag
  and final state). All invalid-upgrade regressions stay.
- **Hermetic synthetic builds (F7).** Synthetic values move into committed `web/.env.preview`,
  `web/.env.preview-v2` and `web/.env.boot-guard` (shape-valid fake values; gitignore exceptions
  like `web/.env.development`). `vite build --mode <name>` loads them; `SAFEBITE_UNVALIDATED_BUILD=1`
  stays on the boot-guard command line because it is not a `VITE_` value. Because ambient
  `VITE_*` variables outrank mode files in Vite, the config gains a fixture check for these three
  modes: it parses the mode file itself (own `KEY=VALUE` parser in `web/src/config/fixtureEnv.ts`,
  no new dependency) and refuses the build if any resolved `VITE_FIREBASE_*` or
  `VITE_USE_EMULATORS` value differs from the file. Every build also emits
  `<outDir>/safebite-build.json` `{ mode, projectId, sourceHash, builtAt }` where `sourceHash` is
  SHA-256 over the contents of `web/index.html`, `web/vite.config.ts`, `web/.env.<mode>` and every
  file under `web/src` and `web/public` (excluded from the precache glob). The upgrade server and
  the preview/boot-guard Playwright configs recompute the hash and refuse to run against a
  missing, wrong-mode or stale dist with a message naming the `build:<mode>` script to run.
  Scripts: `build:preview`, `build:preview-v2`, `build:boot-guard`, `build:e2e` (all three);
  `e2e:preview`, `e2e:boot-guard`, `e2e:upgrade` run Playwright only. CI builds once, then runs
  the three suites. README updated. Existing non-production and worker-decision guards stay.
- **Precache clean-up (F6).** `includeManifestIcons: false` *and* `webmanifest` removed from
  `globPatterns` (the plugin adds `manifest.webmanifest` itself, outside the icons conditional).
  The artefact test in `e2e-upgrade` asserts every precache URL is unique and that the manifest
  and the four icons are still precached exactly once.
- **No manifest for self-destroying builds.** `manifest: false` when `selfDestroying`, so a
  misconfigured artefact is not installable; the boot-guard test asserts no `<link rel="manifest">`.

#### Data model (as spec 2.3, made concrete)

`households/{hid}/restaurants/{rid}`: `name` (1–120), `address` (1–300), optional `phone`
(≤ 40), optional `website` (http(s) URL ≤ 300), optional `lat`/`lng` (both or neither; numbers
with `lat` in −90…90 and `lng` in −180…180), optional `googlePlaceId` (≤ 200), `createdBy`
(uid), `createdAt`, `updatedAt` (server timestamps), `version` (integer, starts at 1),
`deleting` (boolean, false on create; see deletion). No other keys. Required strings are
trimmed client-side and must not be whitespace-only.

`households/{hid}/restaurants/{rid}/claims/{cid}`: `kind` in {`dedicatedKitchen`,
`separateFryer`, `trainedStaff`, `gfMenu`, `preparationPractice`, `accreditation`}; `value` in
{`yes`, `no`, `partial`}; `detail` (string ≤ 1000, may be empty); `source` map with exactly
`type` in {`restaurantStatement`, `accreditingBody`, `ownVisit`, `thirdParty`}, `label`
(1–200) and optional `url` (http(s) ≤ 500) — no other keys in the map; `checkedAt` (calendar
date, below); optional `expiresAt` (calendar date, strictly after `checkedAt`); `authorUid`;
`authorName` (the caller's `users/{uid}.displayName`, checked by the rules with a `get()` of
the caller's own document, which the client may also read — no peer-user reads are introduced);
`createdAt` (server timestamp). No other keys. **URL policy (one rule everywhere):**
`source.type == 'accreditingBody'` requires a non-empty `source.url`, and `kind ==
'accreditation'` requires `source.type == 'accreditingBody'` (and therefore a URL). Form, pure
validation and rules enforce the same statement.

**Calendar dates (F3).** `checkedAt` and `expiresAt` are Firestore timestamps at **00:00:00 UTC**
of the calendar day, and are read, compared and displayed as UTC calendar dates only
(`Intl.DateTimeFormat("en-GB", { timeZone: "UTC" })`; pure code works on `YYYY-MM-DD` strings
derived with UTC getters). The rules require `checkedAt == timestamp.date(checkedAt.year(),
checkedAt.month(), checkedAt.day())` (exact UTC midnight), the same for `expiresAt`, and
`checkedAt <= request.time + duration.value(1, 'd')` so a user anywhere from UTC−12 to UTC+14 can
enter their local "today" while dates two or more days ahead are rejected. The form refuses a
date after the device's local today. **Expiry:** with an explicit `expiresAt`, a claim needs
rechecking once today is *after* `expiresAt` (the expiry day itself is still current). Without
one, it needs rechecking once today is *on or after* the 12-month anniversary of `checkedAt`;
when the anniversary month lacks the day (29 February), the anniversary is that month's last day.
"Today" for display is the device's local calendar date, recomputed on mount, on
`visibilitychange`, and by a timer at the next local midnight, so an open page flips state
without a snapshot. **Same-day precedence:** claims of one kind sort by `checkedAt` desc, then
`createdAt` desc, then id, client-side (no composite index). If the newest claims of a kind
share the newest `checkedAt` and disagree on `value`, the kind shows **"Conflicting evidence —
check before you go"** and lists all of them with equal prominence; otherwise the newest is
current and the rest are history.

No composite indexes: the list orders restaurants by `name`; claims are read unordered and
sorted client-side.

#### Deletion protocol (F1)

Firestore has no atomic collection delete and no cascade. Deleting a restaurant is a three-step
client protocol with a rules-enforced invariant:

1. **Mark.** Transaction: read the restaurant, check `version == expectedVersion`, write
   `deleting: true`, `version + 1`, `updatedAt`. From this commit on, the rules refuse every
   `claims` create under this restaurant (`exists(parent) && parent.data.deleting == false`)
   and every restaurant update other than the mark itself, so no claim can arrive after the
   query in step 2. Rules `get()`/`exists()` see committed state at write time, so a claim
   whose create raced the mark either committed before it (and is found by step 2) or is
   rejected.
2. **Sweep.** Query up to 100 claims; delete them in one transaction; repeat until the query
   is empty.
3. **Remove.** Delete the restaurant document (rules: member; `deleting` must be true).

The protocol is **resumable**: a restaurant with `deleting: true` renders in the list as
"Deleting…" with a **Finish deleting** button that runs steps 2–3, and the list page runs them
automatically once per mount for each such restaurant. The confirm UI reports success only when
step 3 has committed. Claims may never be created under a missing parent (`exists(parent)`).

#### Rules

- `restaurants`: read by members. Create by a member with `createdBy == request.auth.uid`,
  `version == 1`, `deleting == false`, `createdAt == updatedAt == request.time`, full field
  validation. Update by a member with `createdBy`, `createdAt` unchanged, `updatedAt ==
  request.time`, `version == resource.data.version + 1`, full validation, and: if
  `resource.data.deleting` is true the update is denied; the only update that sets `deleting`
  true changes nothing else besides `version`/`updatedAt`. Delete by a member when
  `resource.data.deleting == true`.
- `claims`: read by members. Create by a member with `authorUid == request.auth.uid`,
  `authorName == get(users/$(request.auth.uid)).data.displayName`, `createdAt == request.time`,
  the parent restaurant existing and not deleting, full validation including the nested
  `source` key set and the URL policy. Update denied. Delete by a member.
- `isMember(hid)` (one `get()`) guards every operation; claim creates add one `get()` of the
  parent and one of the caller's user document.
- Parity is proven by **table-driven emulator tests** over every enum member and representative
  invalid values (see Tests). A web unit test that reads `firestore.rules` and checks each
  TypeScript literal appears in it is kept only as a drift smoke check.

#### Online-only writes and read states (F2, F4)

- **Every write is a `runTransaction`.** Transactions require the server and are never queued
  offline; their writes are not applied to the local cache until commit, so snapshots never
  show pending or unacknowledged data and server timestamps are never unresolved. Success is
  reported only when the transaction promise resolves.
- **Write outcomes are typed** in `repository.ts`: `ok`, `conflict` (the transaction read a
  `version` different from the caller's base version; checked on every retry), `notFound` (the
  document is gone), `permission` (`permission-denied` from the rules — membership revoked or a
  client/rules mismatch), `offline` (`unavailable`, or `navigator.onLine === false` before
  starting), `failed` (anything else, message logged without note text). The UI copy is distinct
  for each; only `conflict` offers "Reload to see the latest".
- **Draft vs snapshot.** The edit form seeds a draft and a `baseVersion` once from the first
  snapshot (or from the router state when arriving from the detail page). Later snapshots update
  a separate `remote` value only; they never touch dirty fields or `baseVersion`. If
  `remote.version !== baseVersion` while the draft is dirty, a non-blocking notice says the
  restaurant changed on another device, with **Reload draft** that re-seeds. A successful save
  re-seeds from the transaction result. `transaction.update` writes only the form's fields plus
  `version`/`updatedAt`, so `lat`/`lng`/`googlePlaceId` are preserved untouched.
- **Read states** for every listener: `loading`, `ready`, `offline` (`snapshot.metadata.fromCache`
  — the data is shown with a "Showing last loaded data — you are offline" banner and Add/Edit/
  Delete controls disabled), `denied` (`permission-denied` → "You no longer have access to this
  household", with Sign out), `error` (other listener errors → Retry re-subscribes), `gone`
  (the detail document no longer exists → "This restaurant was deleted", link to the list). An
  empty list renders only from a `ready`, non-cache snapshot.
- **Scoping.** Each page subscribes in an effect keyed on `householdId`/`rid`, unsubscribes on
  cleanup, and ignores callbacks from a superseded subscription (generation counter, as in
  `AuthProvider`). Sign-out unmounts the shell, so no listener survives an account switch.

#### Client modules (`web/src/records/`)

- `types.ts` — read models `Restaurant` and `Claim` (with `id`), write inputs
  `RestaurantInput` and `ClaimInput`, `ClaimKind`, `ClaimValue`, `SourceType`, constant lists
  with UI labels, `CalendarDate` (`YYYY-MM-DD`).
- `dates.ts` — pure `toCalendarDate(Timestamp)`, `fromCalendarDate(CalendarDate): Timestamp`
  (UTC midnight), `localToday(now: Date): CalendarDate`, `addMonths(date, 12)` with end-of-month
  clamping, `formatCalendarDate` (en-GB, UTC).
- `validation.ts` — pure `validateRestaurantInput` and `validateClaimInput(input, today)`
  returning field-keyed messages; limits and the URL policy identical to the rules.
- `evidence.ts` — pure `evidenceStatus(claim, today)` → `current | needsRechecking` and
  `summariseEvidence(claims, today)` → one entry per kind: `unknown`, `current`/
  `needsRechecking` with the newest claim and history, or `conflicting` with the tied claims.
- `repository.ts` — `watchRestaurants`, `watchRestaurant`, `watchClaims` (each takes callbacks
  for data and for the read states above; returns an unsubscribe), `createRestaurant`,
  `updateRestaurant(hid, rid, baseVersion, input)`, `markDeleting(hid, rid, baseVersion)`,
  `sweepClaims(hid, rid)`, `removeRestaurant(hid, rid)`, `deleteRestaurant` (runs the protocol),
  `addClaim`, `deleteClaim`. All writes are transactions returning the typed outcomes.

#### Pages

- `RestaurantsPage` (`/restaurants`) — list with name and address, `Deleting…` rows with
  **Finish deleting**, read-state banners, empty state, **Add restaurant** (disabled offline).
  Replaces `SavedPage`.
- `RestaurantFormPage` (`/restaurants/new`, `/restaurants/:rid/edit`) — name, address, phone,
  website; inline validation; typed outcome messages; "changed on another device" notice with
  Reload draft; Delete (edit mode only) behind the in-page confirm, running the deletion
  protocol with progress ("Removing evidence…"). Coordinates and place ID are never asked for.
- `RestaurantDetailPage` (`/restaurants/:rid`) — facts, `tel:` and website links, the six
  evidence kinds each in one of unknown / current / **needs rechecking** / **conflicting
  evidence** with value, detail, source label and link, checked date, author name and history;
  **Add evidence** (disabled offline); per-claim Delete behind an in-page confirm; a static
  **Call ahead and ask** block with the Swift prompts from `Localizable.strings` labelled by
  group — *Anywhere* (`ask_general`), *Italian* (`ask_italian`), *Asian* (`ask_asian`),
  *Bakeries* (`ask_bakery`) — in British spelling.
- `ClaimFormPage` (`/restaurants/:rid/evidence/new`) — kind, value, detail, source type, label,
  URL (required when the source type is accrediting body; choosing kind accreditation forces
  that source type), checked date (`<input type="date">`, defaults to local today, refuses later
  dates), optional expiry date (must follow the checked date).

Copy never shows a score.

#### Tests

- **Unit (Vitest).** `dates.ts` (UTC round-trips from Rome/London/Auckland-style inputs, DST
  days, `addMonths` end-of-month and leap day, `localToday` across a midnight boundary);
  `evidence.ts` (day before / on / after the anniversary; explicit `expiresAt` on the day and the
  day after; `expiresAt` precedence; unknown kinds; newest wins; same-day tie → `conflicting`,
  same-day agreeing values → `current`); `validation.ts` including the URL policy and
  whitespace-only strings; the rules-literal smoke check; the update store and banner (states,
  `requestedHere` gating of `onNeedReload`, Reload behaviour in each state); the form draft
  (dirty fields and `baseVersion` survive new snapshots and store changes; Reload draft re-seeds);
  outcome mapping in `repository.ts` with a stubbed transaction (conflict, not-found,
  permission, unavailable, offline pre-check); `summariseEvidence` sort order.
- **Rules (`functions/test/rules.records.test.ts`, emulator, table-driven).** Reads: member,
  other member, non-member, unauthenticated, cross-household. Restaurant create: every valid
  optional-field combination; wrong `createdBy`, `version ≠ 1`, `deleting: true`, extra key, bad
  URL, one coordinate without the other, out-of-range coordinates, whitespace-only name, client
  timestamps. Update: stale version rejected, correct version accepted, `createdBy` change
  rejected, update after `deleting` rejected, mark-deleting that also changes a field rejected.
  Delete: rejected unless `deleting`. Claim create: every kind × value × source type; the URL
  policy matrix; nested `source` extra key / wrong type / missing label; non-midnight
  `checkedAt`; `checkedAt` two days ahead rejected, one day ahead accepted; `expiresAt` equal to
  `checkedAt` rejected; wrong `authorName`; missing parent; deleting parent; claim update
  rejected; delete by the other member accepted.
- **Browser (`web/e2e/records.spec.ts`, emulators).** (1) Add a restaurant; list and detail show
  it with six unknown kinds and the call-ahead block. (2) The accreditation form refuses a
  missing URL; a valid accrediting-body claim shows current; a fryer claim checked 13 months ago
  shows needs rechecking; two same-day opposing fryer claims show conflicting evidence.
  (3) Two contexts: Bogdan saves an edit; Ava's stale draft shows the changed-elsewhere notice,
  her save reports a conflict, Reload draft shows Bogdan's values. (4) Deletion versus add: Bogdan
  opens Add evidence for a restaurant with two claims; Ava deletes it completely; Bogdan submits
  and sees the not-found outcome, and his detail page shows "This restaurant was deleted"; an
  admin-context query proves zero claims remain and Ava's list is empty (the mark-then-create
  interleaving itself is the rules test "deleting parent"). (5) Interrupted deletion: the page is closed after
  the mark; on the next visit the list shows Deleting… and Finish deleting completes it.
  (6) Offline save: `context.setOffline(true)`; saving reports the offline outcome, controls are
  disabled, nothing appears after reconnecting. (7) Account switch: Ava's records are not
  rendered after signing in as the stranger, and no listener error surfaces.
- **Upgrade (`web/e2e-upgrade`).** The rewritten valid→valid test, the two-tab test, unique
  precache URLs, manifest and icons precached once. **Boot-guard:** no manifest link. **Build:**
  a fixture-mismatch build (shell `VITE_FIREBASE_PROJECT_ID` set to another value) is refused;
  a stale-dist run is refused with the naming message.

#### Not in this plan

Visited state, notes, offline download, discovery, export, deletion of accounts, composite
indexes, functions changes.

### 3.6 Plan 3 design — discovery through functions (brainstormed 2026-09-22)

Owner rulings taken during the brainstorm:

1. **"Add to our records" carries the place id only.** A result opens `/restaurants/new` with a
   hidden `googlePlaceId` in router state; the member types the name and address themselves. No
   name, address or other Google-derived content crosses to the form or reaches browser history.
   Coordinates are never stored (Google's terms allow caching them for at most 30
   days); `restaurants.lat`/`lng` stay unused. Phone and website are not requested from Google.
2. **No Place Details.** Two callables ship, `searchDestination` and `searchNearby`. Phone,
   website and opening hours bill at the Enterprise tier and nothing needs them; a member types
   them by hand if wanted.
3. **Explicit location.** One search box plus a separate "Near me" button. Tapping "Near me"
   requests the browser position once, then and there, and submits. Nothing is requested on page
   load. A text search sends no location and no bias.
4. **Fixture provider for every non-Google environment.** The callables call a `PlacesProvider`
   interface; a fixture provider serves the emulator, CI and browser tests, selected by the secret
   value `fixture` and only inside the emulator. The Google adapter is unit-tested with a mocked
   `fetch` and one response in the documented Places API (New) shape (a recorded real response
   replaces it once owner action O4 provides a key). (Alternatives rejected: a local stub of the Google
   API — another process in three test configurations; record-and-replay — needs a real key the
   owner has not created yet and goes stale.)

##### Owner ruling (audit S1/F2, 2026-09-22)

Place ID only; the member types name and address. F2 resolved by carrying nothing Google-derived.
The "user-saved exception" ruling 1 previously invoked could not be substantiated: the Google Maps
Platform standard terms §3.2.3(a)(iii) prohibit copying and saving business names and addresses;
the Places API service-specific terms permit caching only latitude/longitude (30 days) and, by
policy, place IDs. Ruling 1 above now reflects this: Google's name and address are displayed in
Discover results but never stored and never prefilled into the form; a record created from a
result holds the place ID (permitted indefinitely by the Places policy) plus a name and address
the member types.

Verified external facts the design rests on (2026-09-22, Google documentation): Text Search is
`POST https://places.googleapis.com/v1/places:searchText`, Nearby Search is
`POST …/v1/places:searchNearby`, both take `X-Goog-Api-Key` and `X-Goog-FieldMask` headers and
`maxResultCount` 1–20; `places.id` is IDs-only tier, `displayName`, `formattedAddress`,
`location`, `googleMapsUri` and `businessStatus` are Pro tier, phone/website/opening hours are
Enterprise; billing is per request at the highest tier requested, with 5,000 free requests per
SKU per month (Google pricing page, checked 2026-09-22; both Text Search Pro and Nearby Search
Pro), aggregated across the billing account. Places content shown without a Google map must carry
the unaltered Google logo.
Place IDs may be stored indefinitely; names and addresses may not be copied and saved (standard
terms §3.2.3(a)(iii)), so a record's name and address are always typed by the member.
`defineSecret` values are overridden locally by the gitignored `functions/.secret.local`
(dotenv format); without it the emulator tries production Secret Manager.

#### Pre-work (carried from the Plan 2a final review)

- `abortable()` rejects with the signal's own `reason` (falling back to an `AbortError` only when
  the reason is undefined), so a timeout abort is distinguishable from a user abort. Existing
  callers (`SettingsPage`) are unchanged.
- `anySignal(...signals)` in `web/src/api/callable.ts` combines an `AbortController`'s signal
  with `AbortSignal.timeout(ms)`. Hand-written: `AbortSignal.any` arrived in iOS 17.4 and the app
  targets iOS 17. `isTimeoutError(err)` joins `isAbortError(err)`. Unit tests for both.

#### Callables (`functions/src/discovery/`)

Both are `onCall`, `region: europe-west2`, `maxInstances: 2` (global options), bound to the
secret `PLACES_API_KEY`, and begin with `requireMember(request)`.

| Callable | Input | Provider call |
|----------|-------|---------------|
| `searchDestination` | `{ query: string, mode?: "destination" \| "venue" }` — trimmed, 1–120 chars; omitted mode preserves the raw query (venue) | Text Search, `maxResultCount: 10`, no location bias |
| `searchNearby` | `{ lat: number, lng: number }` — numbers in range | Nearby Search, circle radius 1,500 m, `maxResultCount: 10`, `includedTypes: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway"]` |

Response: `{ results: DiscoveryResult[], provider: "google" }` with
`DiscoveryResult = { placeId, name, address, googleMapsUri }`. Field mask:
`places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus,places.types`
(`places.location` is not requested; nothing needs coordinates). Results whose `businessStatus`
is not `OPERATIONAL` are dropped server-side. Invalid input → `invalid-argument`. Unknown extra
keys are ignored; identity comes only from `request.auth`.

Text search has explicit intent (owner approved 2026-09-23 after the pre-merge review):
**Town or area** (`mode: "destination"`, the new UI default) sends `food in <query>`;
**Restaurant or venue name** (`mode: "venue"`) sends the entered query unchanged. Older callers
that omit `mode` also retain the raw query, so a cached client searching by venue name is not
reinterpreted as a destination. Deploy functions before hosting. Each submit
still makes one provider request. No `includedType` or strict restaurant filter is sent:
Google does not apply that parameter to geopolitical queries, and restaurant-only filtering
could hide cafés and bakeries. The mapper keeps only places typed restaurant, cafe, bakery,
bar or meal_takeaway, drops localities and missing types, and preserves Google's result order.
Nearby `includedTypes` contains those same five venue types. Invalid modes are refused before
usage is counted. See Google's [Text Search guidance](https://developers.google.com/maps/documentation/places/web-service/text-search).

Real-provider acceptance after O4 must cover a bare town, an area, named restaurants, cafés
and bakeries using the corresponding mode. Adapter fixtures verify request construction and
filtering; they do not establish Google's real result relevance or gluten-free safety.

#### Provider selection and the secret

```ts
interface PlacesProvider {
  searchText(query: string, limit: number): Promise<DiscoveryResult[]>;
  searchNearby(lat: number, lng: number, radiusM: number, limit: number): Promise<DiscoveryResult[]>;
}
```

- **Google adapter:** `fetch` with `X-Goog-Api-Key`, `X-Goog-FieldMask`, JSON body,
  `AbortSignal.timeout(8_000)`. Maps the response to `DiscoveryResult[]`; a result missing `id`
  or `displayName.text` is skipped.
- **Fixture provider:** a committed list of about twelve fake restaurants (clearly fake names and
  addresses, no real venues). Magic queries: `__empty__` → no results; `__unavailable__` →
  throws a provider failure; `__quota__` → throws a provider quota failure; `__slow__` → resolves
  after 12 s (exercises the client timeout). Nearby fixture results are the same list.
- **Selection** (one function, unit-tested for all four branches):

| `PLACES_API_KEY` value | `process.env.FUNCTIONS_EMULATOR === "true"` | Result |
|---|---|---|
| `fixture` | yes | fixture provider |
| `fixture` | no | every call → `failed-precondition` "Search is not configured" |
| empty / missing | any | every call → `failed-precondition` "Search is not configured" |
| anything else | any | Google adapter |

- `functions/.secret.local` is gitignored (explicit entry; `.env.*` does not match it).
  `functions/.secret.local.example` is committed with `PLACES_API_KEY=fixture`. The `emu:*`
  scripts run a tiny `ensure-secret-local` step that copies the example only when the real file
  is missing, so a developer's local key is never overwritten. **Hard stop in the plan:** before
  any task builds on it, prove empirically how `firebase emulators:exec` behaves with the secret
  file absent and with it present, and record the result in the plan.

#### Kill switch, caps, usage

- `config/discovery` `{ enabled: boolean, dailySearchCap: number }` is read through the Admin SDK
  on every call. **Missing document = switched off** (a fresh project fails closed). The emulator
  seed writes `{ enabled: true, dailySearchCap: 50 }`. Disabled → `failed-precondition` with
  message "Search is switched off".
- `households/{hid}/usage/{yyyymmdd}` (UTC day) `{ searches: number }`. A transaction increments
  it **before** the provider is called and throws `resource-exhausted` with
  `details: { reason: "dailyCap" }` when `searches >= dailySearchCap`. Failed provider calls
  still count (cost-safe: a flapping provider cannot burn unlimited calls).
- Rules: no `match` for `config` or `usage`, so default-deny applies; a rules test asserts a
  member can neither read nor write either.

#### Error mapping (server)

| Cause | Code | `details` |
|-------|------|-----------|
| Provider HTTP 429 or `RESOURCE_EXHAUSTED` status | `resource-exhausted` | `{ reason: "providerQuota" }` |
| Timeout, network failure, HTTP 5xx | `unavailable` | — |
| HTTP 4xx other than 429 (our request shape is wrong) | `internal` | — (status logged; provider text never logged; Google's error status enum logged from a fixed allow-list) |
| Config disabled or missing | `failed-precondition` | message "Search is switched off" |
| Not configured (table above) | `failed-precondition` | message "Search is not configured" |

Structured logs carry `{ kind, uid, householdId, resultCount, durationMs, outcome }` and, for
nearby, coordinates rounded to 2 decimal places. **Never** the query text (a destination reveals
travel plans) or full coordinates.

A failure log carries fixed diagnostics only — `outcome`, `status` (ProviderError) or `errorName`
(unexpected) — and never provider-echoed text: the installed `firebase-functions/logger` discards
a `message` field on the structured payload in favour of the positional message, so a bounded
`message` field there never reached the log in the first place; provider text is never trusted
regardless (audit observation, 2026-09-22).

#### Client (`web/src/discover/`)

- **`search.ts`** — pure reducer + `useDiscoverySearch()` hook. States: `idle`, `searching`,
  `results`, `empty`, `error` with `reason ∈ off | dailyCap | providerQuota | unavailable |
  offline | timeout | locationDenied | locationUnavailable | invalid`. Each submit takes a
  sequence number, aborts the previous `AbortController`, and calls the callable through
  `abortable(promise, anySignal(controller.signal, AbortSignal.timeout(20_000)))`. A response
  (success or error) is applied only if its sequence number is still current. If
  `navigator.onLine === false` at submit, the state becomes `error/offline` without a call.
  Callable codes map one-to-one onto reasons (`failed-precondition` "switched off" → `off`;
  `resource-exhausted` by `details.reason`; `unavailable` → `unavailable`; a timeout abort →
  `timeout`; a user abort is ignored). The last submitted query stays in the box.
- **`DiscoverPage.tsx`** — search-mode selector (**Town or area**, default, or **Restaurant or
  venue name**), text field + Search button. Changing mode does not submit a search. A separate "Near me" button calls
  `navigator.geolocation.getCurrentPosition` once on tap (`timeout: 10_000`,
  `enableHighAccuracy: false`); `PERMISSION_DENIED` → `locationDenied`, anything else →
  `locationUnavailable`. Nothing is requested on mount. Each state renders a distinct message;
  none shows sample venues. The results list shows name (linked to `googleMapsUri`), address, a
  "Directions" link and an "Add to our records" button per result. Directly under the list, the
  unaltered official Google logo asset from the Places policies page (committed under
  `web/public/google/`), shown whenever results are present. A result whose `placeId` matches
  a household record (from the existing `watchRestaurants` listener) shows "In our records"
  linking to that record instead of the add button.
- **Links.** Directions:
  `https://www.google.com/maps/dir/?api=1&destination=<encoded name>&destination_place_id=<id>`.
  Both external links open in a new tab with `rel="noopener noreferrer"`. `RestaurantDetailPage`
  gains "Open in Google Maps"
  (`https://www.google.com/maps/search/?api=1&query=<encoded name>&query_place_id=<id>`) when the
  record holds a `googlePlaceId`, built from stored fields only.
- **Add to our records.** Navigates to `/restaurants/new` with router state
  `{ prefill: { googlePlaceId } }` — the place id only (owner ruling, audit S1/F2, 2026-09-22);
  name and address are never carried. The create form's draft always starts empty in this case,
  shows a one-line "Linked to a Google Maps place" notice with a link built from the place id
  alone (`placeIdUrl`), and the member types the name and address themselves.
  `RestaurantInput` gains optional `googlePlaceId`, written by `createRestaurant` (rules
  already accept it as an optional string ≤ 200). `updateRestaurant` already preserves it; the
  edit form never touches it. Duplicate guard: the button is replaced by "In our records" when a
  match exists, and the create submit re-checks the listener's latest snapshot before writing,
  redirecting to the existing record if one appeared meanwhile.
- **Nothing persists from a search.** Results live only in component state: no cache, no
  storage, no offline copy. The terms' caching limits are met by construction. The one exception
  is the place ID handed to the record form through router state (`history.state`), which the
  Places policy allows to be stored indefinitely; no name, address or other Places content ever
  leaves component state.

#### Tests

- **Functions unit (Vitest, no emulator):** provider selection (all four branches); input
  validation; Google adapter request shape with a mocked `fetch` (URL, headers, body, timeout);
  response mapping from one response in the documented Places API (New) shape committed under
  `functions/test/fixtures/` (a recorded real response replaces it once owner action O4 provides
  a key);
  error mapping for 429, 5xx, network failure and timeout; UTC usage-day key across a midnight
  boundary (bracketed, never the exact boundary).
- **Callable emulator tests (`functions/test/discovery.test.ts`):** member gets fixture results;
  unauthenticated and non-member refused; spoofed identity ignored; missing config refuses;
  disabled config refuses; cap reached at exactly the cap; usage counted for a failed provider
  call; each magic query returns its mapped code; invalid inputs rejected.
- **Rules:** members cannot read or write `config/discovery` or their household's `usage` docs.
- **Web unit:** `abortable` reason preservation; `anySignal`; sequencing (a late response for an
  old sequence is dropped); code→reason mapping; offline short-circuit; `DiscoverPage` per state;
  empty draft with the place-id notice, and the duplicate guard; "In our records" matching; detail page link.
- **Browser (`web/e2e/discover.spec.ts`):** destination search shows results and the logo;
  empty; switched off; daily cap; provider unavailable; client timeout via `__slow__`; "Near me"
  with Playwright's granted geolocation; "Near me" denied; add to records → save → record shows
  the Google Maps link; duplicate shows "In our records"; a second search supersedes a slow first
  one. Config and usage are toggled between tests through the existing emulator REST helper.

#### Decisions taken without owner input (override if wrong)

| Decision | Reason |
|----------|--------|
| 10 results, 1,500 m nearby radius, 50 searches per household per day | Two users on foot; far inside the free tier |
| Cap counts failed provider calls | Cost-safe |
| Missing config document means switched off | Fresh project fails closed |
| Client timeout 20 s, server 8 s | Cold starts add several seconds on top of the upstream call |
| Query text never logged | A destination reveals travel plans |
| `places.location` not requested | Nothing needs coordinates; keeps the record free of 30-day data |
| Radius and result count fixed server-side (spec §2.5 listed `radiusM`/`limit` as inputs) | Fewer inputs to validate; the client has no use for other values |

#### Not in this plan

Place Details; coordinates on records; offline copies of anything from Google; visited state
and notes (Plan 4); the square-icon question (Plan 5); staging key creation and secret binding
(owner action O4 — a prerequisite for staging, not for this plan); Firestore index changes.
