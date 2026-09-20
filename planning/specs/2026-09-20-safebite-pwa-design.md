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
  `safebite-production-13ba1` must not appear in any new file.
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
| **2. Restaurant records and evidence** | **PWA app shell first** (`vite-plugin-pwa` manifest, real icon set replacing the Vite logo, `apple-touch-icon`, `apple-mobile-web-app-capable`, `theme-color`, standalone display — a plan gap found in the Plan 1 final review); then `restaurants` + `claims` model, rules with accreditation validation and version checks, private editing form, evidence display with checked/expired states, "call ahead" prompts, unit + rules + e2e tests | Plan 1 |
| **3. Discovery through functions** | `searchDestination`, `searchNearby`, `placeDetails` callables with secret key, kill switch, caps, attribution; discover UI with all failure states; search cancellation; external directions links; "add to our records" from a result (stores place ID only) | Plan 2 |
| **4. Shared collection and notes** | `collection` + `notes` model and rules, save/unsave/visited, authored notes, optimistic concurrency with reload prompt, account-switch cache clearing, e2e | Plan 2 (Plan 3 optional) |
| **5. Privacy, offline, operations** | Opt-in offline download to IndexedDB, clear-on-signout, export callable, account-deletion callable, settings page, privacy/terms content, staging config files, cost-control checklist, real-iPhone acceptance script | Plans 1–4, O3–O6 |

Plans 2–5 are written after Plan 1 is executed and reviewed, so they can name
the real interfaces that landed rather than predicted ones.

**Plan 2 pre-work carried from the Plan 1 final review (2026-09-20):**

- Dedupe the Settings page's `whoami` call (ref/AbortController) so React StrictMode's
  double effect issues one request; then drop the global 15 s Playwright `expect` timeout
  and the doubled emulator warm-up in `web/e2e/global-setup.ts`.
- Switch the household read rule to `request.auth.uid in resource.data.memberIds` (no
  extra `get()`), keeping `isMember(hid)` for subcollections.
- Type-check `functions/test/**` (a `tsconfig.test.json`), add `.gitattributes`
  (`* text=auto eol=lf`), make the 60 s vitest timeouts conditional on `CI`.
- Unit-test the auth provider's generation-counter race and unsubscribe-on-unmount.
- Before staging: supply `VITE_FIREBASE_*` build-time values, add the `staging` alias,
  confirm `europe-west2`, set the £10 budget alert (owner actions O3–O6).

### 3.4 Decisions taken without owner input (override if wrong)

| Decision | Reason | Cost if wrong |
|----------|--------|---------------|
| Email + password sign-in, no Sign in with Apple in v1 | Two known users; Apple sign-in needs Apple developer config the PWA does not otherwise need | Small: add provider later |
| New Firebase project for the pilot rather than reusing `safebite-production-13ba1` | Existing project holds public-read rules and possibly seeded invented data; its state is unverified | Owner pays for a second project's negligible free tier |
| Legacy `scripts/` seed and duplicate `SafeBite/` config copies are deleted in Plan 1 | They target production and contain invented claims; git history keeps them | Nothing — recoverable from history |
| Firestore SDK offline persistence off; explicit IndexedDB download instead | Makes "opt-in", "exclude provider data" and "clear on sign-out" provable | More code in Plan 5 |
| No npm workspaces; `web/`, `functions/` and a thin root `package.json` | Firebase deploy packages `functions/` standalone; hoisted deps break it | Slightly more `npm ci` steps in CI |
| Optimistic concurrency by integer `version` enforced in rules | Meets "reject stale versions, offer reload" without server round-trips | None foreseen |
