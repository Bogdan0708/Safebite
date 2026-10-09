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
| `households/{hid}/collection/{rid}` | `shortlisted`, `visited`, `visitedOn?`, `updatedBy`, `updatedByName`, `updatedAt`, `version` (see §3.7) | members via rules |
| `households/{hid}/restaurants/{rid}/notes/{nid}` | `text`, `authorUid`, `authorName`, `createdAt`, `updatedAt`, `version` (see §3.7) | author only; any member during restaurant deletion |
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

Owner ruling (2026-09-23): the primary assistant may carry out O3–O6 through the official `gcloud`/`firebase` CLIs, confirming each billing or irreversible step first. Delegated subagents still may not. Deploys and pushes remain governed by §3.2.

| ID | Action | Needed before |
|----|--------|---------------|
| O1 | `git pull --ff-only` to bring `a3403d1` into local `main` | Plan 1 |
| O2 | Install a JDK (21+) so Firebase emulators run locally | Plan 1 verification |
| O3 | ~~`firebase login --reauth`; inventory `safebite-production-13ba1` read-only~~ Done 2026-09-23: legacy project not reachable from the owner account; see `planning/specs/firebase-inventory.md` | Plan 5 staging |
| O4 | Historical key from `e7c0268`: its parent project (`776764264965`) is not held by any owner account, so it cannot be restricted (2026-09-23). A new key restricted to Places API (New) was created in the pilot project and stored as secret `PLACES_API_KEY` (done 2026-09-23) | Plan 3 staging |
| O5 | ~~Create the pilot Firebase project~~ Done 2026-09-23: `safebite-pilot-urfs3v`, Firestore `europe-west2`, Blaze, project-scoped £10 budget, alias `staging`, self sign-up disabled | Plan 5 |
| O6 | ~~Create the two member accounts and their `users/` + `households/` docs~~ Done 2026-09-23 by admin script; both sign-ins verified | Plan 5 |
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
| **4. Shared collection and notes** | `collection` + `notes` model and rules, save/unsave/visited, authored notes, optimistic concurrency with reload prompt, account-switch cache clearing, e2e | Plan 2 (Plan 3 optional) — design in §3.7 (2026-09-24) |
| **5. Privacy, offline, operations** | Opt-in offline download to IndexedDB, clear-on-signout, export callable, account-deletion callable, settings page, privacy/terms content, staging config files, cost-control checklist, real-iPhone acceptance script | Plans 1–4, O3–O6 — split 2026-10-01 into 5a (data rights), 5b (offline reading) and 5c (operations and release); outline and 5a design in §3.8 |

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

### 3.7 Plan 4 design — shortlist, visited state and notes (brainstormed 2026-09-24)

Plan 2b made the Saved tab list every restaurant record, so a record is already shared by the
household. Plan 4 therefore does not add a second "saved" list. It adds a shortlist and visited
state *on top of* the records, plus authored notes. This section supersedes the `collection` and
`notes` rows of §2.3 wherever they differ.

Owner rulings taken during the brainstorm:

1. **Shortlist within the records.** Records remain everything the household has researched,
   including places judged unsafe. "Shortlisted" means "we want to go". The Saved tab filters
   *Shortlist* (default) or *All records*. Named trip lists are deferred.
2. **Notes belong to the restaurant record**, not to the shortlist entry. They survive
   un-shortlisting and are removed only with the restaurant.
3. **Visited is household-wide:** one flag plus a visit date, settable and clearable by either
   member, independent of the shortlist. No per-member visits, no visit log.
4. **State lives in a separate document per restaurant** (`collection/{rid}`), so toggling
   shortlist or visited never bumps the restaurant's `version` and never conflicts with an edit
   of its details. (Rejected: fields on the restaurant, since every toggle would conflict with edits and
   reopen the reviewed Plan 2b rules; a `state` subdocument under each restaurant, which needs a
   collection-group query and index to list.)
5. **Change password ships in Plan 4** (Settings), not Plan 5.

#### Data model

`households/{hid}/collection/{rid}`: document id = restaurant id; created on first use.

| Field | Rule |
|---|---|
| `shortlisted` | bool |
| `visited` | bool |
| `visitedOn` | present exactly when `visited == true`; UTC-midnight timestamp (the `checkedAt` convention); `<= request.time + 1 day` |
| `updatedBy` | `== request.auth.uid` |
| `updatedByName` | `==` the caller's own `users/{uid}.displayName` (as `authorName` on claims). Members cannot read each other's `users` documents, so the name is denormalised |
| `updatedAt` | `== request.time` |
| `version` | create `== 1`; update `== resource.data.version + 1` |

Keys are exactly these (`hasOnly`/`hasAll`, with `visitedOn` optional). Create and update require
the parent restaurant to exist with `deleting == false`. Delete is allowed only while the parent is
marked `deleting` (sweep step). Clients never delete a collection document otherwise:
un-shortlisting writes `shortlisted: false`. The §2.3 fields `restaurantId`, `savedBy` and `savedAt` are
dropped: the id names the restaurant and `updatedBy`/`updatedAt` replace the others.

`households/{hid}/restaurants/{rid}/notes/{nid}`

| Field | Rule |
|---|---|
| `text` | non-blank string, `<= 2000` characters (`LIMITS.note`, parity-tested) |
| `authorUid` | `== request.auth.uid` on create; immutable |
| `authorName` | `==` the caller's own `users/{uid}.displayName` on create; immutable |
| `createdAt` | `== request.time` on create; immutable |
| `updatedAt` | `== request.time` on every write |
| `version` | create `== 1`; update `== resource.data.version + 1` |

Read: any member. Create: any member, parent exists and is not `deleting`. Update: the author only,
changing only `text`, `updatedAt`, `version`, and only while the parent is not `deleting`.
Delete: the author at any time, **or any member while the parent is `deleting`** (so the sweep can
remove the other member's notes).

Neither document carries anything a safety label could be derived from, and neither write touches a
claim, so visiting or noting can never refresh a verification date (§2.1).

#### Deletion protocol (extends §3.5; amended after audit F1)

Mark `deleting` → sweep claims → sweep notes → delete `collection/{rid}` if present → set
`cleanupDone: true` → delete the restaurant. The existing resume path ("Finish deleting" on the
Saved page, automatic resume once per mount) runs the extended sequence. Progress text gains
"Removing notes…". The deletion confirmation reads: "Deletes the restaurant, its evidence, and
both members' notes."

**Completion gate (rules).** A Plan 3-era client finishes a deletion by sweeping claims and deleting
the restaurant; Firestore does not cascade to subcollections, so under the old delete rule it
would orphan notes and collection state. The gate makes that impossible for any client version:

- `restaurants` gains an optional `cleanupDone` (bool; added to `validRestaurant`'s `hasOnly`).
  Creation and ordinary updates must not set it (the create rule requires it absent; the ordinary
  update branch requires it unchanged).
- A new update branch **marks cleanup done**: `resource.data.deleting == true`,
  `request.resource.data.cleanupDone == true`, affected keys only `cleanupDone`, `version`,
  `updatedAt`, version `+ 1`, `updatedAt == request.time`.
- Delete requires `deleting == true && cleanupDone == true &&
  !exists(.../collection/$(rid))`.

After the `deleting` mark no new claim, note or collection document can be created (their
create rules require a parent with `deleting == false`). The client therefore sets
`cleanupDone` only after its sweeps have returned empty from the server, and the flag cannot go
stale. Rules cannot prove that a subcollection is empty. The gate relies on that ordering, and
the `exists()` check guards the one sibling document it can see.

An old client's final delete is refused. The restaurant stays listed as "Deleting…", and any
Plan 4 client completes it (automatic resume or "Finish deleting"). The old tab shows its
existing permission message, and its update banner offers the reload.

**Idempotent, concurrent sweeps.** Each page is read from the server. The transaction then
`tx.get`s every document on the page and deletes only those that still exist. Deleting
`collection/{rid}`, setting `cleanupDone` and deleting the restaurant also read first. An
already-missing document or an already-set flag counts as done, never as a failure. Two
sweepers, a sweeper racing an old-client resumer, and a retry after any intermediate step
therefore all converge without a misleading permission error. (The existing Plan 2b
`sweepClaims`/`removeRestaurant`, which delete blind, change to the same pattern.)

#### Client

Repository (`web/src/records/repository.ts`, still the only Firestore module for records, or a
sibling `collection.ts`/`notes.ts` if the file would pass ~400 lines): `watchCollection(hid)`,
`setShortlisted`, `setVisited(hid, rid, base, visitedOn | null)`, `watchNotes`, `addNote`,
`updateNote`, `deleteNote`, `sweepNotes`. All writes are `runTransaction`s with typed
`WriteOutcome`s. Version checks run inside the transaction (a missing collection document is
base version 0 → create). Online-only, as in §3.5.

**Saved page.** Filter *Shortlist* | *All records*, held in component state only. Rows show name,
address and plain labels "Shortlisted" / "Visited 3 May 2026", with no safety wording in the list.
Order by name. Empty states: no records ("No restaurants yet. Add the first one.") vs an empty
shortlist ("Nothing on the shortlist. Open a record and tap Add to shortlist."). Two listeners
(restaurants, collection) joined by id in a pure, unit-tested function. One offline notice when
either is cached. Deleting rows appear under both filters. No toggles in the list.

**Restaurant page.**
- A status block under the address: "Add to shortlist" / "On shortlist · Remove"; "Mark visited" opens
  an inline date field (default today, no future dates) with Save/Cancel; when visited: "Visited
  <date> · Change date · Clear"; "Last changed by <updatedByName>". A version conflict shows the
  current state with the standard conflict message and never auto-retries. Offline disables the
  controls, as with "Add evidence".
- "Our notes", between Evidence and "Call ahead and ask", subtitled "Personal notes. They are not
  evidence and don't change any checked date." Newest first. Each note shows the text, the author,
  the date and "edited" when `version > 1`. Edit (inline) and Delete (in-page confirm, never
  `window.confirm`) are offered only on the caller's own notes. "Add a note" is an inline textarea
  with a counter.
- A failed save keeps the draft with the error. An edit conflict shows the current text beside the
  draft and lets the member choose.
- The page shows one offline notice for all its listeners, which closes the Plan 2b parked double-notice item.
  The parked Plan 2b wording items (resume-flow text, the form's shared outcome block) are fixed here.

**Account switch (amended after audit F2).** Firebase synchronises auth state across same-origin
tabs, so the reset belongs in the auth listener, not in the sign-out button. `AuthProvider` keeps
`lastUid`, the last signed-in UID observed *in this document*. When `onAuthStateChanged` reports
`null` or a different UID while `lastUid` is set, the provider bumps its generation counter,
immediately renders a neutral "Signing out…" state (old UI hidden, pending callbacks void), and
calls `window.location.replace("/")`. A full reload discards every listener, the Firestore memory
cache and all React state in that tab. Every tab that had a member signed in resets itself, whichever
tab initiated the change. Explicit `signOut()` only calls Firebase sign-out, and the listener
performs the reset in the initiating tab too. No loops: a document that starts signed out has no
`lastUid`, and after the reload it starts fresh. Token refreshes do not fire
`onAuthStateChanged`, and reauthentication keeps the same UID, so neither triggers a reset. The
service-worker precache holds only the app shell.

**Change password (Settings; amended after audit F3).** Current password, new password,
confirmation. Client validation: at least 8 characters, and the confirmation matches. This is a client
rule only: the pilot project has no server password policy (verified 2026-09-24), and one could
be added later. Sequence: `reauthenticateWithCredential`. If it fails, stop and **never** call
`updatePassword`. Otherwise call `updatePassword`. Each row applies only in the phase where its
outcome is definitive. Messages:

| Condition | Message |
|---|---|
| reauthentication: wrong current password (`auth/invalid-credential`, `auth/wrong-password`) | "That isn't your current password." |
| reauthentication: `auth/too-many-requests` | "Too many attempts. Wait a few minutes and try again." |
| reauthentication: `auth/network-request-failed`, or offline before starting | the standard offline message |
| update: server policy rejects the new password (`auth/weak-password`, `auth/password-does-not-meet-requirements`) | "Your new password doesn't meet this account's password rules. Choose a different one." |
| update: `auth/requires-recent-login` | "For security, sign out and back in, then try again." |
| any other failure after the update request was sent (including `auth/network-request-failed`, `auth/too-many-requests` and unknown errors) | "We couldn't confirm whether your password changed. Sign out, then sign in with your new password; if that doesn't work, use your old one." |
| any other failure before the update request | "Couldn't change your password. Your old password still works." |

The Firebase SDK performs an account lookup after the update succeeds, so a later failure does not
prove the password is unchanged (implementation audit F3, 2026-09-24).

"Password changed" appears only after `updatePassword` resolves. After any failure the form stays
usable and submit is re-enabled. A wrong current password clears only that field. A policy rejection
clears the two new-password fields. The uncertain outcome clears all three fields, because the
current password may no longer be current. Offline and other errors keep every field. The member stays
signed in on success (same UID, so no reset). No email reset (it needs templates and a trusted domain).
A forgotten password is reset via the Admin API.

**Read states for joined data (audit clarification).** The Saved list and the restaurant page each
combine two or more listeners. The combined view is loading until every listener has produced a
snapshot. A `denied` or `error` from any listener is shown (errors are never hidden behind the offline
notice). A missing `collection/{rid}` means "not shortlisted, not visited" (base version 0) only
when the collection snapshot is server-backed (`ready`). While it is loading, errored or only cached,
the status controls are disabled and no "Nothing on the shortlist" empty state is shown. Authoritative
empty messages need `ready` snapshots, as in §3.5. One offline notice covers all listeners that
are `offline`.

**Notes: confirmation identity and conflicts (audit clarification).** A pending delete confirmation
is bound to the note's id and version, like the claim confirmations in Plan 2b (37cc46b). It resets if
that note changes or disappears. An edit conflict shows the current server text next to the
member's draft. Choosing "Keep mine" writes the draft with the *current* server version as its
base; choosing "Use theirs" discards the draft. Either way the next write carries the version the
chooser displayed, so a third change triggers a fresh conflict. A note edited or deleted from
another device while the restaurant is being deleted gets the ordinary `notFound`/`conflict`
outcomes.

#### Tests

- **Unit:** repository collection/notes functions, including the version check re-run on
  transaction retry and base-version-0 create; the records×collection join and filter; visit-date
  validation; `LIMITS.note` parity with the rules; Saved page filters and empty states; restaurant
  page status block, notes list (author-only controls, edited marker), note draft preserved on failure,
  edit-conflict chooser; single offline notice; change-password states; sign-out reload.
- **Rules (`functions/test`, emulator):** collection create/update/version, the `visitedOn`
  conditions, `updatedBy`/`updatedByName` spoofing, parent missing or `deleting`, delete only while
  `deleting`; notes create/update author-only, immutable fields, `authorName` spoofing, text at
  exactly 2,000 characters accepted and at 2,001 refused, delete by non-author refused unless the parent is `deleting`,
  author edit/delete while the parent is `deleting`; completion gate: `cleanupDone` refused on
  create and on ordinary updates, allowed only by the mark-done branch, restaurant delete refused
  without `cleanupDone` or while `collection/{rid}` exists; non-member refused throughout.
- **Mixed-version deletion (emulator, repository level):** the Plan 3-era sequence (sweep claims,
  delete restaurant, blind deletes as in the merged Plan 3 `repository.ts`) run against the new rules with seeded notes and
  collection state is refused at the final delete, the parent stays marked and resumable, and the
  new `finishDeleting` then completes all cleanup; an old resumer racing a new deleter; two new
  sweepers concurrently; a retry after each intermediate step (claims swept, notes swept,
  collection removed, `cleanupDone` set) completes without a permission outcome.
- **Browser (`web/e2e`, two members):** a shortlist change seen live by the other member; filter;
  mark visited, change date, clear; notes by both members with author-only controls; deleting a
  restaurant sweeps both members' notes and the collection document, including an interrupted
  deletion resumed from the Saved page; simultaneous toggle conflict; change password, then sign in with the
  new one (the test uses its own user or restores the fixture password in cleanup);
  **cross-tab reset:** two pages in one browser context, both showing records and notes. Sign out in
  page A. Both pages reset (a marker set on `window` before the sign-out is gone afterwards) and show
  the sign-in form without any test-driven `goto`/`reload`. Then sign in as the non-member in page B,
  again without test navigation, and no restaurant name is ever rendered. Unit tests: no reload on
  initial signed-out start, on the same UID, or on token refresh.
- **Test isolation:** the emulator clean-up helpers also remove notes and collection documents.
  Account-switch tests never rely on manual reloads.
- **Gate:** typecheck; web unit; functions + rules; browser (retries 0); boot-guard, preview and
  upgrade; guardrail greps.

#### Decisions taken without owner input (override if wrong)

| Decision | Reason |
|----------|--------|
| Note limit 2,000 characters; password minimum 8 | Room for a visit account; stricter than Firebase's floor |
| Filter choice not persisted | No new browser storage before Plan 5's offline design |
| No quick toggles in the list | Avoids accidental taps while scrolling |
| Account change resets each tab by a full reload | Discards the Firestore memory cache, listeners and React state in one step; the cross-tab browser test is the guarantee |

#### Deploy note (amended after audit F1)

Old clients never write the new paths. The completion gate stops them finishing a deletion that
would orphan notes or collection state, so old tabs, cached bundles and a hosting rollback remain
safe after the new rules deploy. Deploy order: rules and functions first, then hosting. Staging has
never served hosting (verified 2026-09-24: live channel with no releases, site returns 404), so
the first deploy has no older clients in the wild. The gate is not relied on for that; it covers
rollbacks and later releases.

#### Not in this plan

Named trip lists; per-member visits or a visit log; email password reset; offline download,
export and account deletion (Plan 5, which must include `collection` documents and notes, and
delete the caller's notes on account deletion); list-level quick actions.

### 3.8 Plan 5 outline and Plan 5a design — data rights (brainstormed 2026-10-01)

#### Plan 5 split (owner ruling, 2026-10-01)

Plan 5 is four mostly independent deliverables, so it runs as three plans in order. Each has its
own design section, audit and implementation plan.

| Plan | Delivers | Hands on to the next plan |
|---|---|---|
| **5a — data rights** | `deleteAccount` and `exportHousehold` callables, deletion recovery screens, the `clearDeviceData()` registry | 5b registers its IndexedDB store with the registry; 5b's policy for a remote deletion while a device is offline builds on 5a's deletion record |
| **5b — offline reading** | IndexedDB download; offline start-up when membership was resolved before (today `AuthProvider` resolves membership by server reads, so a written IndexedDB copy alone does not make the app usable after reopening in airplane mode); account isolation; download timestamps; interrupted refreshes; clearing across open tabs; Settings **Clear device data**; an explicit limitation and reconnect policy for remote deletion while offline | 5c documents the actual retention and offline behaviour |
| **5c — operations and release** | Legal pages (wording describes the retention and offline behaviour 5a and 5b establish), staging configuration, cost-control checklist, the square-icon decision, the `/__/auth/handler` check, the real-iPhone acceptance script (drafted early, run against the finished staging app) | — |

The key 5b acceptance test is: download, fully close the app, enable airplane mode, reopen, and
read saved restaurants, evidence and notes. Separately, signing out removes the downloaded copy
and switching accounts cannot expose it.

Owner rulings taken during the 5a brainstorm:

1. **A departing member's restaurants and evidence stay with the household, anonymised.** Their
   notes are deleted. Names and UIDs on claims, collection documents and `createdBy` are replaced
   by a fixed marker. (Rejected: deleting their evidence, which silently removes safety
   information the other member relies on; leaving names in place, which fails "delete own
   account and contributions".)
2. **Deletion requires recent authentication, checked by the server.** The UI always asks for the
   password and reauthenticates first. The callable refuses unless the ID token's `auth_time` is
   at most 5 minutes old. This proves the account authenticated within the last 5 minutes (a
   fresh sign-in also satisfies it), not that the password was entered for this operation. An
   unlocked phone with an older session is not enough, and a modified client cannot skip the
   check. (Amended after the design review, finding "security wording".)
3. **One idempotent callable with a server-side deletion record** (rather than a
   Firestore-triggered background job, which conflicts with §2.6's "the UI reports success only
   after the callable returns", or client-driven steps, which cannot remove `memberIds` or delete
   an Auth record).

This section supersedes §2.6's export and account-deletion bullets wherever they differ (the
export carries author names, not UIDs).

**Design review, 2026-10-01** (`planning/audits/2026-10-01-plan-5a-design-review.md`): three P1
and two P2 findings plus five contract tightenings, all verified against the code and amended
below. In summary:

| Finding | Amendment |
|---|---|
| P1-1 Auth failure does not prove deletion | Completion receipts (see Data model, Recovery) replace inference from Auth errors; anything unproven is reported as uncertain |
| P1-2 Missing household ≠ tree deleted | Step completion is recorded on the deletion record only after the whole step succeeded; 3b re-runs `recursiveDelete` until it resolves |
| P1-3 Discovery can recreate `usage` | Membership is re-checked inside the usage transaction (`functions/src/discovery/search.ts`); in scope for 5a |
| P2-4 Concurrency | Step 1 is one transaction that re-validates membership; every anonymising write re-reads and re-checks its document in a transaction |
| P2-5 Share needs a fresh gesture | Two taps: **Prepare export**, then **Share or save export** |
| Tightenings | Export membership check in the read-only transaction and creator/updater names; cleanup failures and timeouts; recent-auth wording; reserved marker; examples and tests |

**Implementation audit, 2026-10-02** (`planning/audits/2026-10-02-plan-5a-implementation-audit.md`):
one P1 and two P2 findings against the built branch at `4bde68e`, all verified and amended below.

| Finding | Amendment |
|---|---|
| P1-1 Recovery deletes whichever account is signed in | The saved request is bound to its UID; recovery refuses a different account; `deleteMyAccount` pins the account across reauthentication and the call; the server refuses an `expectedUid` that differs from the token; completion (sign-out and the deleted notice) acts only for the request's account (auditor re-review, 2026-10-02) |
| P2-2 Some completed deletions leave a receipt at `started` | Every path records `dataDeleted` before Auth deletion; `checkAccountDeletion` reconciles `started` and `dataDeleted` receipts from server state |
| P2-3 An expired or missing receipt reads as "didn't finish" | `none` maps to "confirmation unavailable", never to "unfinished" |
| Final review P2: a queued sign-in can be signed out by completion | Completion never calls `signOut`; a device-wide deleted-session record keeps the deleted account out of the app (Delete account page, step 4) |

#### Data model

`accountDeletions/{uid}` — admin-written only.

| Field | Meaning |
|---|---|
| `householdId` | Copied from `users/{uid}` inside the step 1 transaction |
| `lastMember` | Set once, by the step 2 transaction, and never changed |
| `startedAt` | Server timestamp |
| `step2At`, `step3At`, `step4At` | Server timestamps, each written only after that whole step succeeded |

`accountDeletionReceipts/{receiptId}` — admin-written only, never readable by clients.

| Field | Meaning |
|---|---|
| (document id) | `sha256(requestId)` in hex. `requestId` is 32 random bytes (base64url) generated by the client for each call and sent with `expectedUid` (the call's data is `{ requestId, expectedUid }`) |
| `status` | `"started"` → `"dataDeleted"` (after step 5) → `"complete"` (after step 6) |
| `uid` | Present while `status` is not `complete`, so `checkAccountDeletion` can reconcile the receipt from server state (below); removed in the same write that sets `complete` |
| `updatedAt` | Server timestamp |
| `expireAt` | `updatedAt + 7 days`; a Firestore TTL policy on this field deletes the receipt |

A receipt never carries a household ID or name, and carries the UID only until it is complete. Only the holder of `requestId` can find it.

Rules: `accountDeletions/{uid}` — `allow read: if signedIn() && request.auth.uid == uid; allow
write: if false;`. `accountDeletionReceipts` — no client access (default deny). No other rule
changes.

**Marker.** Anonymisation writes `authorUid`/`updatedBy`/`createdBy` = `"former-member"` and
`authorName`/`updatedByName` = `"Former member"`. Firebase UIDs are arbitrary strings of up to 128
characters (the emulator seed already uses `ava-uid`), so the marker is **reserved** rather than
impossible: `requireMember` refuses the UID `former-member`, the emulator seed and the owner's
provisioning script refuse to create it, and a rules guard (`request.auth.uid != 'former-member'`
inside `isMember`) closes the client side.

#### `deleteAccount` callable (`functions/src/account/`)

`region: "europe-west2"`, `maxInstances: 2`, `timeoutSeconds: 60`, set on the callable itself
(the `onCall` snapshot rule from §3.6). Request data: `{ requestId, expectedUid }`. `requestId` is
validated as 43 base64url characters and `expectedUid` as a non-empty string of at most 128
characters; anything else is `invalid-argument`. *Amended after the implementation audit (P1-1):*
when `expectedUid !== request.auth.uid` the call is refused with `permission-denied` and
`details: { reason: "accountChanged" }`, before any receipt or data is touched. Authority still comes
only from the verified token; `expectedUid` can only cause a refusal, never grant anything.

**Entry check.** `request.auth` must be present, else `unauthenticated`. `request.auth.token.auth_time`
must be within 5 minutes of the server clock, else `failed-precondition` with
`details: { reason: "recentLogin" }`. The receipt for this `requestId` is created with
`status: "started"` (create-if-missing). The step runner then decides the starting point inside
the step 1 transaction, never from reads taken earlier.

**Steps.** The runner takes injected dependencies (`db`, `auth`, `deleteTree`, `now`, and a test-only
hook before each step) so tests can fail or pause any step. On every call it starts at the first
step whose completion is not recorded, and repeats that step in full.

| Step | Action | Completion recorded by |
|---|---|---|
| 1 | **One transaction** reads `accountDeletions/{uid}`, `users/{uid}` and `households/{hid}`. Record exists → resume. Else, the caller is a member (UID in `memberIds`) → create the record with `householdId`. Else, no `users/{uid}` → jump to step 6 (only the Auth record can be left, see below). Else → `permission-denied` | The record exists |
| 2 | Transaction on `households/{hid}` and the record: remove the UID from `memberIds` if present; on the first completion set `lastMember` (true when `memberIds` ends up empty) and `step2At` | `step2At` |
| 3a | `lastMember == false`. For each restaurant in the household, in pages: **in one transaction per page**, re-read every claim `where authorUid == uid`, the `collection/{rid}` document and the restaurant; anonymise only the documents whose field still equals the UID at commit time; delete notes `where authorUid == uid` (re-read in the same transaction). A transaction retry re-reads, so a concurrent edit by the other member keeps their own attribution. After the last page succeeds, set `step3At` | `step3At` |
| 3b | `lastMember == true`: `deleteTree(households/{hid})` (`recursiveDelete`), run **every time** until it resolves without error, even when the household document is already missing; then set `step3At` | `step3At` |
| 4 | Delete `users/{uid}`; set `step4At` | `step4At` |
| 5 | Delete `accountDeletions/{uid}`; set the receipt to `"dataDeleted"` | The record is gone and the receipt says `dataDeleted` |
| 6 | On the Auth-only path (no record, no `users/{uid}`), first set the receipt to `"dataDeleted"`: that state proves steps 4 and 5 already ran, or that the account was never provisioned (amended after the implementation audit, P2-2). Then `auth.deleteUser(uid)` (`auth/user-not-found` counts as done); set the receipt to `"complete"` | Receipt `complete` |

Returns `{ deleted: true, lastMember }` only after step 6 recorded completion.

**Why this order.** Step 2 is the first data step: the rules deny every read and write by a UID
outside `memberIds`, so from that moment no tab or device of the departing member can create
evidence or notes carrying their name while step 3 runs. A write that committed before step 2 is
caught by step 3. The Auth record is deleted last.

**Starting states.** Step 1's transaction accepts exactly three:

| State | Meaning |
|---|---|
| A member and no record | New deletion |
| A record exists | Resume at the first unrecorded step |
| No `users/{uid}` and no record | Only the Auth record can be left: step 4 deletes `users/{uid}` only after step 2 removed the UID from `memberIds`. The other way to reach this state is an Auth account that was never provisioned, which can only delete itself |

A signed-in account that still has a `users` document but is not in its household's `memberIds`
and has no record (an admin removed it) is refused.

**Two calls from the same UID.** Because step 1 re-validates membership inside its transaction, a
call that passed the entry check while another call was finishing cannot recreate the record: by
the time it commits, the UID is no longer a member (or `users/{uid}` is gone), so it either resumes
an existing record or falls through to the step 6 path, where `user-not-found` counts as done.

**Two members deleting at once.** Serialised by the step 2 transaction. Exactly one records
`lastMember: true` and runs 3b. The other's 3a page transactions may find documents already
deleted by the tree deletion; a missing document counts as done.

**Anonymisation never bumps `version` or `updatedAt`**, so the remaining member never sees a
"someone else changed this" conflict caused by a departure. Claims are immutable to clients, and
the restaurant rules keep `createdBy` unchanged on client updates, so those markers survive later
edits. A later collection write by the remaining member replaces the marker with their own name, as
for any update.

**Accepted limitation.** Free text a member wrote into evidence (`detail`, `source.label`) stays as
written. Only names and UIDs are replaced.

**Logging.** Outcome, `lastMember` and duration on success (document counts were dropped for 5a,
ruling in the execution ledger); never names, note text, email addresses or `requestId`.

#### `checkAccountDeletion` callable (`functions/src/account/`)

Same options. **No sign-in required** (a deleted account has none). Request: `{ requestId }`,
validated as above. Returns `{ status: "none" | "started" | "dataDeleted" | "complete" }` for
`sha256(requestId)`. *Amended after the implementation audit (P2-2):* for a `started` or
`dataDeleted` receipt it reconciles from server state. It completes the receipt (sets `complete`,
removes `uid`) and returns `complete` only when all three hold:

- `auth.getUser(uid)` answers `auth/user-not-found`;
- `users/{uid}` is absent;
- `accountDeletions/{uid}` is absent.

Step 4 deletes `users/{uid}` only after the data steps recorded completion, and step 5 deletes the
record after that, so the three together prove the household data was handled. Auth absence alone
proves nothing. This also completes an older request whose deletion a newer request finished.
Otherwise the receipt's own status is returned. It never returns the UID. It reveals nothing
without the 256-bit `requestId`. `maxInstances: 2` and `concurrency: 1` bound abuse; this is not a
spend cap (5c checklist).

*Amended while writing the implementation plan (2026-10-01):* the client cannot detect a
deleted Auth record. `@firebase/auth` 1.13.6 maps the server's `USER_NOT_FOUND` on token
refresh to `auth/user-token-expired`, the same code as a revoked session, and then signs the
user out (`_logoutIfInvalidated`). The Auth emulator answers `INVALID_REFRESH_TOKEN` instead. So
only the server decides completion.

#### Discovery usage writes (amended after review P1-3)

`runSearch` (`functions/src/discovery/search.ts`) checks membership through `requireMember`
before its usage transaction. A request can pass that check, pause, and then recreate
`households/{hid}/usage/{day}` after a last-member tree deletion. The usage transaction therefore
also `tx.get`s `households/{hid}` and refuses with `permission-denied` unless the household exists
and its `memberIds` contains the caller. The provider is never called after a refusal, and nothing
is written. Because step 2 and step 3b both act on the household document or its tree, the usage
transaction either commits first (and its document is removed by 3b) or sees the caller gone. No
other server code writes under `households/`.

#### `exportHousehold` callable (`functions/src/account/`)

Same options as `deleteAccount`; no request data. **The membership check runs inside the same Admin
read-only transaction as every data read**, so the file is a consistent snapshot of a household the
caller belonged to at that instant. Returns:

```json
{
  "format": "safebite-export", "formatVersion": 1,
  "exportedAt": "2026-10-01T16:20:00Z", "exportedBy": "Bogdan",
  "household": { "name": "Home" },
  "restaurants": [{
    "name": "…", "address": "…", "phone": "…", "website": "…", "googlePlaceId": "…",
    "createdByName": "Former member", "createdAt": "…", "updatedAt": "…",
    "shortlisted": true, "visited": true, "visitedOn": "2026-05-03",
    "listUpdatedByName": "Bogdan", "listUpdatedAt": "…",
    "evidence": [{ "kind": "separateFryer", "value": "yes", "detail": "…",
                   "source": { "type": "restaurantStatement", "label": "…", "url": "…" },
                   "checkedAt": "2026-04-01", "expiresAt": null, "authorName": "Former member", "createdAt": "…" }],
    "notes": [{ "text": "…", "authorName": "Ava", "createdAt": "…", "updatedAt": "…" }]
  }]
}
```

- **Names.** `createdByName` is resolved server-side from the current members' `users` documents
  (members cannot read each other's, but the Admin SDK can). The marker, or a UID that is no longer
  a member, becomes "Former member". `listUpdatedByName`/`listUpdatedAt` come from the collection
  document (`updatedByName`/`updatedAt`) and are omitted when there is none. Notes are always by a
  current member, since a departing member's notes are deleted.
- Calendar dates (`checkedAt`, `expiresAt`, `visitedOn`) are `YYYY-MM-DD`; instants are ISO UTC.
  Optional fields absent on the record are omitted, except `expiresAt`, which is `null` when absent.
- A restaurant without a collection document exports `shortlisted: false, visited: false`.
- Excluded: UIDs, email addresses, `version`, `deleting`, `cleanupDone`, `updatedBy`, restaurants
  marked `deleting`, `usage` documents, `config`, `users` documents. Nothing from Google is
  exported except the stored `googlePlaceId`.
- Serialised size above 8 MB → `resource-exhausted` (the callable response limit is 10 MB), so a
  truncated file is impossible. The threshold is a constant the tests lower.
- Logging: document counts and duration only.

#### Client

**Device cleanup registry** (`web/src/device/cleanup.ts`):

```ts
export interface DeviceCleaner { name: string; clear(): Promise<void> }
export function registerDeviceCleaner(cleaner: DeviceCleaner): void;
/** Runs every registered cleaner with a 5 s timeout each; never throws; names failures and timeouts. */
export function clearDeviceData(): Promise<{ failed: string[] }>;
```

- **Pending-clear marker.** Before running the cleaners, `clearDeviceData()` sets
  `localStorage["safebite.pendingClear"] = "1"` and removes it only when `failed` is empty. At
  start-up, before any account is resolved or any stored data is read, `main.tsx` checks the marker.
  If it is set, the app shows a blocking "Clearing data from this device…" screen and runs
  `clearDeviceData()` again. On failure: "Some data on this device couldn't be cleared." with **Try
  again**, and nothing else renders. This is the contract 5b's stores depend on: no stored copy is
  readable while the marker is set. A store must also tag its contents with the owning UID and
  refuse to serve another UID's data (5b), so a failed clear can never expose one account's copy
  to another.
- **Where it runs.** `AuthProvider`'s listener awaits `clearDeviceData()` before `resetDocument()`
  on every account change (sign-out from any tab, switch of user, the SDK reporting a deleted
  account as signed out). The reset proceeds whatever the result; the marker makes the next start
  finish the job.
- **Deletion success with failed clearing** is reported separately from the server result: "Your
  account has been deleted. Some data on this device couldn't be cleared." with **Try again**. The
  server deletion is never described as failed because local clearing failed.
- Nothing persists on the device before 5b (Firestore persistence is off and the reload discards
  the memory cache), so 5a ships the registry, the marker, its call sites and tests with fake
  cleaners (failing, hanging). 5b registers the IndexedDB cleaner and adds the Settings button. The
  service worker's app-shell cache holds no household data and is not cleared.

**Delete account page** (`/settings/delete-account`, linked from Settings):

- Text states the consequence: normally "Your sign-in and your notes are deleted. Restaurants and
  evidence you added stay with the household, shown as 'Former member'." When the caller is the
  only member: "Everything in the household is deleted." The page reads `memberIds` length from
  the household document the member can already read. The text is advisory: the other member may
  leave in the meantime, and the server's step 2 transaction decides. It links to **Export first**.
- Current-password field and **Delete my account**, disabled offline.
- Sequence (amended after the implementation audit, P1-1: every step is bound to one account).
  The caller passes the UID of the account the screen is acting for (`expectedUid`). The flow
  captures `auth.currentUser` once, refuses with "account changed" if its UID differs, and re-checks
  that `auth.currentUser` is still that same user object, with that UID, after step 1, after step 2
  and immediately before step 3:
  1. Reauthenticate with the existing helper logic from `changePassword.ts`
     (`reauthenticateWithCredential`). Its failures map to the existing messages (wrong password,
     too many attempts, offline). A failed reauthentication sends nothing.
  2. `getIdToken(true)`, so the callable sees the new `auth_time`.
  3. Generate `requestId` and durably write a local cleanup intent under
     `safebite.authCleanup.<encoded UID>:<requestId>` before any destructive server call. Refuse
     to send the deletion if shared storage cannot save/read back this guard. Each request has
     its own key, so a refusal in one tab cannot remove another tab's intent. This is not proof
     of deletion and never produces a deleted notice. A definite refusal removes only that
     request's guard; an uncertain response retains it. Then store
     `{ requestId, uid: expectedUid }` (JSON) in `sessionStorage` under
     `safebite.deletionRequest` before the call, so a reload of this tab can still check it, and only
     for that account. Call `deleteAccount({ requestId, expectedUid })` with a 70-second client timeout, behind a
     non-dismissable "Deleting your account… keep this page open" screen.
  4. Success: `finishDeleted(requestUid)`. *Amended after the auditor's re-review and again after
     the final review (2026-10-02, `planning/audits/2026-10-02-plan-5a-final-review.md`):* completion
     **never signs anyone out**. Firebase `signOut` only queues a "no user" update and signs out
     whoever is current when the queue reaches it. Another tab's sign-in already waiting in that
     queue would be applied first and then removed, and no SDK call signs out one named account.
     A deleted account needs no sign-out: its Auth record is gone and the rules deny it everything.
     It needs to be recognised and kept out of the app, as follows.
     - **Checks.** `finishDeleted` checks that the signed-in account is none or `requestUid` before
       `clearDeviceData()`, after it, and after persisted-session removal. After the first check,
       it records the confirmed deleted UID before any await, protecting sibling-tab startup.
     - **All checks pass.** It sets the per-tab notice flag `{ kind, uid: requestUid }`, clears the
       request and reloads the tab, subject to the cleanup guard described below.
     - **Another account is current at any check** (another tab signed in during the call or the
       cleanup). It clears the request and writes no notice. A deleted-UID record already written
       before an awaited cleanup stays recorded for that UID. It shows **Other account,
       deletion confirmed**: "The account this request was for has been deleted. You're now signed in
       as a different account, which was not changed." with **Continue**. It never says "Nothing was
       deleted" once the server confirmed the deletion. If another account was current at the
       first check, it does not start device cleanup, because that account owns the device copy;
       5b's per-UID cleanup removes the
       deleted UID's copy.

     **Deleted-session record.** `localStorage["safebite.deletedUids"]` is a JSON array of UIDs this
     device has seen deleted (at most 10, newest kept), mirrored into `sessionStorage` for a tab whose
     localStorage is blocked. Readers take the union of both.
     - **`AuthProvider`.** When the current user's UID is in the record, the provider resolves a new
       state, `deletedSession`, before reading any membership document. The gate renders the sign-in
       screen with "Your account has been deleted." (or the failed-clearing variant).
     - **Signing in replaces the session.** Signing in calls `signInWithEmailAndPassword`, which
       replaces the current account, so no other account can be removed. A successful sign-in removes
       that UID from the record, which covers an account an admin re-created.
     - **Other tabs.** A `storage` event on the record's key resets any tab whose current UID is now
       recorded. This replaces the cross-tab reset that the sign-out used to cause.
     - **The notice belongs to an account.** It shows only in the `deletedSession` state, for the
       recorded UID, or on a signed-out sign-in screen in a tab whose notice flag names a recorded UID.
       The flag is discarded as soon as the provider resolves any other account.
     - **Auth persistence and the startup gate** (2026-10-08, correction of the two P2 findings at
       `c673c5e`). The app explicitly initializes Auth with IndexedDB persistence only, or memory.
       It never reads, migrates or removes Firebase's old localStorage/sessionStorage Auth keys:
       a localStorage read followed by remove is not atomic across tabs. Legacy keys are left
       inert, including another tab's replacement login. Users with only a legacy saved session
       sign in again; an existing older release may still use its legacy key until it closes.
     - **Before importing Firebase**, bootstrap reads durable cleanup intents, confirmed deleted
       UIDs, and any older per-tab recovery request. It checks the entire UID set in one database
       open and one readwrite transaction, deleting the saved user only if its UID is in that set.
       A different UID is preserved. The open budget is 5 seconds total, independent of history. Only successful
       cleanup or a nonmatching/absent record permits persistent Auth. An unavailable open or
       unexpected layout selects **memory-only Auth** for that document, without reading the old
       persisted user. Missing IndexedDB or inaccessible shared guard storage also selects memory.
       The sign-in screen explains that sign-in will not survive reload. A later navigation tries
       cleanup again; it cannot lose the durable guard when the old document is destroyed.
     - **Completion** publishes the confirmed deleted UID before awaiting cleanup, so another tab's
       storage-event reload also encounters the gate. It clears device data, removes only the
       request UID's IndexedDB session, rechecks the current account, writes its scoped notice,
       clears the request and reloads. An unavailable removal produces the device-cleanup warning,
       not a claim that local cleanup succeeded. If an older recovery request cannot save a guard
       and cannot remove persistence, it stays on a retry screen instead of resetting.
     - **Open timeout.** The 5-second bound covers open only. A late open still compares/deletes
       the named UID; a started transaction settles through its own events. Safe startup does not
       depend on that callback surviving navigation. The layout remains pinned to `@firebase/auth`
       1.13.6: DB `firebaseLocalStorageDb`, store `firebaseLocalStorage`, key
       `firebase:authUser:<apiKey>:[DEFAULT]`. No `signOut` call is made during completion.
     - **Guard lifecycle** (amended after the 2026-10-09 re-audit). After successful batch cleanup,
       bootstrap retires captured request and `:confirmed` keys for UIDs whose deletion was
       confirmed. It preserves uncertain intents and request keys added while cleanup awaited.
       A timeout/error retains every guard. The existing deleted-UID notice list remains capped
       at 10; even that history is checked in the same single open. Confirmation is recorded in
       cleanup metadata even when another account is now current, without writing a deleted notice
       for that account. A successful explicit sign-in also forgets its UID's guards and notice
       record. After an uncertain deletion, a reload in **any same-origin tab** can remove that
       UID's shared saved session and sign it out in every tab observing shared persistence, even
       if the server received nothing. The receipt alone decides whether deletion happened.
     - **Residual SDK behaviour.** An already-running tab holding the deleted user can clear shared
       persistence on its own SDK poll or invalid-token response. The previously accepted short
       SDK polling window remains; these changes remove the additional startup network lookup
       race caused by a known deletion and timed-out cleanup. This is not a claim to replace
       Firebase's internal cross-tab synchronization.
- `recentLogin` from the server → "For security, enter your password again." `accountChanged`
  (client or server) → "The signed-in account changed. Nothing was deleted." `permission-denied`
  → "This account can't be deleted here."

**Recovery after a lost response** (amended after review P1-1, and again while writing the
plan). On a timeout, `unavailable`, `internal`, `deadline-exceeded` or a network failure, the
client never infers anything from Auth errors and never probes the token: a refresh after
deletion would sign the tab out mid-recovery. The `requestId` is already in `sessionStorage`
(`safebite.deletionRequest`). Whenever that key is present, `App`'s gate renders
`DeletionRecoveryScreen` ahead of every auth state, so recovery survives the reset reload that
any sign-out causes. The screen calls `checkAccountDeletion({ requestId })`. One pure,
unit-tested function maps the result, the request's saved UID and the signed-in UID (read after
`auth.authStateReady()`) to a screen. *Amended after the implementation audit (P1-1, P2-3).*

| Receipt (after server reconciliation) | Signed-in account | Screen |
|---|---|---|
| the check call fails | any | **Uncertain:** "We couldn't confirm whether your account was deleted." **Check again** repeats only the check, without a password; **Sign out** |
| `complete` | none, or the request's account | The success path, through `finishDeleted(requestUid)` (no sign-out; the deleted-session record): if a different account becomes current during the cleanup, the screen switches to **Other account** with the confirmed line instead |
| any | a **different** account | **Other account:** "This deletion request belongs to another account. Nothing will be deleted from this one." **Sign out** and **Continue as this account** (both clear the key). No delete form. With a `complete` receipt it adds "That account's deletion is confirmed." and never signs the current account out |
| `none` | none, or the request's account | **Confirmation unavailable:** "We can't confirm what happened to this deletion request. The confirmation may have expired." **Sign out** and **Continue** (both clear the key). It never says the deletion did not finish and never promises that signing in finishes it |
| `started` or `dataDeleted` | the request's account | "Your account deletion didn't finish." **Finish deleting** (password; bound to the request's UID; a new `requestId`) and **Sign out** |
| `started` or `dataDeleted` | none | "Your account deletion didn't finish. Sign in to that account to finish it." Clears the key and shows the sign-in form; after sign-in, **Finish deleting your account** or **Delete this sign-in** (below), both bound to the signed-in account, takes over |

A saved value that is not a valid `{ requestId, uid }` (for example, the bare ID an older build
saved) is treated as having no owner: only **Uncertain**, **Confirmation unavailable** or the
success path can show, never a delete form.

**Sign out** on this screen clears the key. Expired credentials and a disabled account are never
read as success.

**Signing in mid-deletion.** When `AuthProvider` resolves `notMember`, it also reads
`accountDeletions/{uid}`:

- The record exists → new state `deletionPending` → a **Finish deleting your account** screen
  with a password field, the same sequence as above, and **Sign out**.
- No record and no `users` document → the not-invited screen gains **Delete this sign-in**
  (password, same sequence; the call takes the step 6 path). Self sign-up is disabled, so in
  practice only a crash between steps 5 and 6 produces this state.
- The read fails with anything but `permission-denied` → the existing error state.

**Other tabs and devices of the departing member.** From step 2 their listeners report the
existing denied state. The deleting tab's local sign-out resets every same-origin tab. Another
device keeps a valid ID token for up to an hour with every read denied, until its refresh fails
and the SDK signs it out, which resets it. 5b defines what a downloaded copy on such a device does.

**Export** (Settings → **Export household data**, online only; amended after review P2-5):

1. **Prepare export** calls `exportHousehold` and builds a `File` named
   `safebite-export-YYYY-MM-DD.json` (`application/json`), held in component state only.
2. When it is ready, the page shows **Share or save export**. That fresh tap calls
   `navigator.share({ files: [file] })` when `navigator.canShare?.({ files: [file] })` is true
   (iPhone offers Save to Files, Mail, AirDrop). `canShare` is a capability check only; activation
   comes from this tap. An `AbortError` (sheet cancelled) is silent. A `NotAllowedError`, or no
   file-share support, falls back to an `<a download>` with an object URL, revoked afterwards. A
   **Download instead** link is always shown next to the button.

States: preparing, ready, offline, failed. The page says plainly that the file contains both
members' notes and leaves the app once shared. The file is dropped when the page unmounts. Whether
the share sheet works in Home Screen mode is checked on a real iPhone in 5c.

#### Empirical stops (prove before any task builds on them; record the result in the plan)

1. After `reauthenticateWithCredential` and `getIdToken(true)`, the callable sees a fresh
   `auth_time` (emulator). *Probed 2026-10-01:* a second password sign-in advances `auth_time`.
   The Auth emulator also changes `auth_time` on a plain refresh, which production does not, so
   the stale-token refusal is proven only by the handler unit test.
2. *Answered 2026-10-01 from the SDK source and the emulator:* after `deleteUser`, production
   refresh fails with `USER_NOT_FOUND`, which `@firebase/auth` 1.13.6 reports as
   `auth/user-token-expired`; the emulator answers `INVALID_REFRESH_TOKEN`. No client rule may
   depend on these codes (see Recovery). The pilot is re-checked in 5c.
3. *Answered 2026-10-01 from the SDK source:* on `user-token-expired` or `user-disabled` the SDK
   signs the user out, so another tab's `onAuthStateChanged` fires `null` and resets it in
   production. The emulator's code does not trigger this, so browser tests rely only on the
   deleting tab's own sign-out.
4. `recursiveDelete` on a household whose document is already missing still removes the remaining
   descendants (emulator). *Probed 2026-10-01: yes (0 documents left).* The rejection case is
   covered by an injected `deleteTree` in the runner tests.
5. `firebase-admin` 14 supports read-only transactions (`{ readOnly: true }`) against the emulator.
   *Probed 2026-10-01 with 14.4.0: reads work; a write inside one is refused.*
6. The Firestore TTL policy on `accountDeletionReceipts.expireAt` can be set with `gcloud` on the
   pilot (recorded for the deploy; the emulator does not run TTL).

#### Tests

- **Functions + rules (emulator):**
  - Non-last member deletes:
    - claims, collection documents and `createdBy` carry the marker;
    - their notes are gone and the other member's notes are intact;
    - `memberIds` is updated;
    - `users/{uid}`, the record and the Auth user are gone, and the receipt is `complete`;
    - nothing else changed: versions, `updatedAt` and the other member's claims are byte-equal.
  - Last member deletes: the whole tree is gone, `usage` included.
  - Stale `auth_time` → `recentLogin` (handler unit test with a fabricated token), plus one fresh
    sign-in emulator pass. The UID `former-member` is refused by `requireMember` and the rules.
  - A `users` document without membership → `permission-denied`.
  - Rules: `accountDeletions` readable only by its owner and never writable by a client;
    `accountDeletionReceipts` not readable or writable by any client.
  - `checkAccountDeletion`: works without sign-in; an unknown `requestId` returns `none`; a
    malformed one is `invalid-argument`; a `dataDeleted` receipt whose Auth user is gone is
    completed (`uid` removed) and returns `complete`, and one whose Auth user exists returns
    `dataDeleted`; the UID never appears in a response.
- **Failure injection and interleaving (findings P1-1 to P2-4):** the runner's injected hooks
  drive each case.
  - A crash before each of steps 2–6: the receipt and record show the right state, the next call
    converges to a clean run's end state, and no call reports `deleted: true` early.
  - `deleteTree` rejects after removing the household document: the record keeps no `step3At`, the
    Auth user still exists, and the retry removes the remaining descendants.
  - Discovery against last-member deletion: a search that passed `requireMember` is paused, the
    deletion completes, and the search resumes. It is refused, no `usage` document exists, and the
    provider was never called. The mirror case (the search commits first) leaves no `usage` either.
  - Two calls from the same UID: call B paused after the entry check, call A completes, B resumes.
    No record is recreated, B returns success through the step 6 path, and both receipts end
    `complete`.
  - Collection race: the anonymiser has read Ava's collection document. Bogdan updates it
    (`updatedBy` = Bogdan), then the anonymiser's transaction retries. Bogdan's attribution is
    intact.
  - Two members deleting at once: both finish, and the tree is deleted once.
- **Export:** the shape and the exclusions. The test checks that no identity **field** (`uid`,
  `authorUid`, `updatedBy`, `createdBy`, `email`, `version`, `deleting`, `cleanupDone`) appears
  anywhere in the output. Free text is not scanned. Also: names resolved for current and former
  members; a non-member refused, with the check inside the transaction (a member removed between
  calls is refused); the size limit, tested by lowering the constant.
- **Web unit:**
  - the recovery mapping, covering every row; no row reads an Auth error code;
  - every state of the delete-account page;
  - `AuthProvider` `deletionPending`;
  - the registry: failing and hanging cleaners are reported, it never throws, the marker stays set
    on failure, and start-up blocks while the marker is set;
  - export: prepare then share as two taps, `NotAllowedError` falls back to download, cancel is
    silent.
- **Browser (Playwright, emulators, retries 0):**
  1. Ava deletes her account. Bogdan sees "Former member" on her evidence and her notes are gone.
     Ava's sign-in then fails.
  2. The last member deletes, and the household is gone.
  3. Response lost after the server finished: `page.route` forwards the call and aborts the
     response. The receipt check shows success.
  4. Request never reached the server: the route aborts before forwarding. "Didn't finish"
     appears, and **Finish deleting** completes the deletion.
  5. A seeded deletion record shows **Finish deleting your account** at sign-in.
  6. Deleting in one tab resets a second tab.
  7. Export: **Prepare export**, then **Share or save export** takes the download path (Chromium
     has no file share), and the JSON parses with the expected content.
- **Regressions from the implementation audit (permanent):**
  - Browser (final review): with the deletion tab's Auth queue held, Bogdan's sign-in from a second
    tab is queued before the completed response is delivered. Afterwards Bogdan is still the
    signed-in account in both tabs, no deleted notice is shown, Ava's sign-in fails, and Bogdan and
    the household survive. A control with the same queued switch and no deletion keeps Bogdan.
    The probe is kept at `planning/audits/plan-5a-review-probes/signout.spec.cjs`.
  - Web unit (final review): `finishDeleted` never calls `signOut`. `AuthProvider` maps a recorded
    UID to `deletedSession` without membership reads. A `storage` event resets only a tab whose
    current UID is recorded. A successful sign-in removes its UID from the record. The notice flag
    is discarded when another account resolves.
  - Browser: Ava's interrupted request is saved in a tab, Bogdan signs in, and recovery shows
    **Other account** with no delete form. Bogdan and the household survive, and Ava's sign-in
    still works.
  - Web unit: `deleteMyAccount` refuses when `auth.currentUser` changes during reauthentication or
    the token refresh, and nothing is sent. Completion: when another account becomes current during the callable or
    during device cleanup, for direct completion and for receipt recovery, that account is never
    signed out, no deleted notice is written, and **Other account, deletion confirmed** shows. The recovery mapping covers every row above, including
    `none` → confirmation unavailable and a bare legacy ID.
  - Functions: an `expectedUid` mismatch is refused before any receipt or data change. A crash after
    `deleteUser` and before `complete` is injected on the member path and on the Auth-only path, and
    each receipt reconciles to `complete`. An older `started` receipt whose deletion a newer request
    finished reconciles to `complete`. A `started` receipt whose Auth user is gone but whose
    `users/{uid}` still exists stays `started`.
- **Gate:** typecheck; web unit; functions + rules; browser; boot-guard, preview and upgrade;
  guardrail greps.

#### Decisions taken without owner input (override if wrong)

| Decision | Reason |
|----------|--------|
| The delete page links to Export first | Deletion is irreversible; the export is one tap away |
| The last member's deletion removes the household | §2.6; nothing would be readable by anyone afterwards |
| 5-minute `auth_time` window; 70 s client timeout | Long enough to type a password and finish; the timeout exceeds the function's 60 s |
| Marker `former-member` / "Former member", reserved | Readable in the UI and the export; refused as a UID everywhere |
| Anonymisation does not bump `version` or `updatedAt` | A departure must not raise edit conflicts for the remaining member |
| No UIDs or emails in the export | Names identify authorship; identifiers are internal |
| Receipts keyed by a hashed client nonce, kept 7 days | Proves completion after the Auth record is gone without storing who deleted |
| 5-second timeout per device cleaner | A hung store must not trap the reset; the marker finishes the job at next start |
| **Delete this sign-in** on the not-invited screen | The only way out of the step 5–6 crash window; sign-up is disabled, so no stranger reaches it |
| An admin-removed member (with a `users` doc) cannot self-delete | Not a state the app creates; refusing is safer than guessing |

#### Deploy note

Rules (the `accountDeletions` read, the reserved-marker guard) and functions (`deleteAccount`,
`checkAccountDeletion`, `exportHousehold`, and the amended discovery usage transaction) first,
then hosting. Set the TTL policy on `accountDeletionReceipts.expireAt` in the same deploy
(empirical stop 6). No new indexes: the per-restaurant `authorUid` and `updatedBy` equality
queries use automatic single-field indexes. The pilot has served hosting since 2026-10-01 (Plan 4
bundle), so older clients exist. They need no compatibility gate: from step 2 an old client of the
departing member is denied everything, and an old client signing in mid-deletion shows the
not-invited screen (a new client offers **Finish deleting**).

#### Not in this plan

Offline download and the **Clear device data** button (5b); legal pages, cost checklist, icons and
iPhone acceptance (5c); an admin removing another member; Cloud Logging retention (documented in
5c).
