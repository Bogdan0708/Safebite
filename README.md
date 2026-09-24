# SafeBite

**Find safe gluten-free dining across Europe and the UK**

SafeBite is an iOS application designed to help people with coeliac disease find verified gluten-free restaurants. With a unique three-tier trust scoring system, users can make informed decisions about where to eat safely.

## Features

### Core Functionality
- **Interactive Map Discovery** - Browse gluten-free restaurants on a map with location-based filtering
- **Trust Score System** - Transparent verification showing restaurant safety:
  - **Professional Score (0-40)**: Verified certifications, owner questionnaires, dietitian validation
  - **Community Score (0-35)**: Reviews from verified users weighted by credibility
  - **Freshness Score (0-25)**: Time-decay based on verification/review recency
- **Restaurant Safety Profiles** - Detailed info including dedicated kitchen, separate fryers, staff training, and certifications (Coeliac UK, AIC, DZG, GFCO, GFFP)
- **Verified Reviewer System** - Users pass a 10-question safety quiz to become trusted reviewers
- **Saved Favorites** - Bookmark restaurants with sorting and filtering options
- **Safety Incident Reporting** - Document and report cross-contamination incidents

### User Features
- **User Profiles** - Track dietary needs and severity levels (coeliac, NCGS, wheat allergy, preference)
- **Premium Subscription** - Monthly/yearly tiers for enhanced features
- **Multi-language Support** - English, German, French, Italian, Spanish
- **GDPR Compliance** - Full data export, deletion, and consent management

## Tech Stack

- **Language:** Swift 5.9+
- **UI Framework:** SwiftUI
- **Architecture:** [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) v1.15+
- **Data Persistence:** SwiftData
- **Backend:** Firebase (Auth, Firestore, Crashlytics, Analytics)
- **Maps:** MapKit
- **In-App Purchases:** StoreKit 2
- **Image Loading:** Kingfisher

## Requirements

- iOS 17.0+ / macOS 14.0+
- Xcode 15+
- Swift 5.9+

## Installation

### Prerequisites

1. **Google Places API Key** - Get one from [Google Cloud Console](https://console.cloud.google.com/)
2. **Firebase Project** - Create a project at [Firebase Console](https://console.firebase.google.com/)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Bogdan0708/Safebite.git
   cd Safebite
   ```

2. **Open in Xcode**
   ```bash
   cd SafeBite
   open Package.swift
   ```

3. **Configure Firebase**
   - Download `GoogleService-Info.plist` from your Firebase project
   - Add it to the `SafeBite` target in Xcode

4. **Configure API Keys**
   - Copy `Config.xcconfig.template` to `Config.xcconfig`
   - Add your Google Places API key:
     ```
     GOOGLE_PLACES_API_KEY = your-api-key-here
     ```

5. **Build and Run**
   - Select an iOS 17+ simulator or device
   - Press `Cmd + R` to build and run

### Firebase Setup (Optional)

Deploy Firestore security rules and indexes:

```bash
cd SafeBite/scripts
bash setup.sh
```

## Project Structure

```
SafeBite/
├── SafeBite/
│   ├── SafeBiteApp.swift          # App entry point
│   ├── Features/                   # TCA-based feature modules
│   │   ├── Auth/                  # Authentication flows
│   │   ├── Map/                   # Main map view
│   │   ├── Search/                # Restaurant search
│   │   ├── Saved/                 # Favorites management
│   │   ├── Profile/               # User settings
│   │   ├── RestaurantDetail/      # Restaurant info
│   │   ├── Review/                # Review submission
│   │   ├── Subscription/          # Premium paywall
│   │   └── GDPR/                  # Privacy settings
│   ├── Models/                    # Data models
│   ├── Services/                  # Business logic services
│   └── Resources/                 # Localization & assets
├── SafeBiteTests/                 # Unit tests
├── SafeBiteUITests/               # UI tests
├── scripts/                       # Setup and deployment scripts
├── firestore.rules                # Firestore security rules
└── firestore.indexes.json         # Firestore indexes
```

## Architecture

SafeBite follows **The Composable Architecture (TCA)** pattern:

- Each feature is composed of a `Feature` (reducer) and a `View`
- State is managed predictably through actions and reducers
- Side effects are handled through the `Effect` type
- Dependencies are injected for testability

## Testing

Run the test suite:

```bash
cd SafeBite
swift test
```

Or in Xcode: `Cmd + U`

## Localization

SafeBite supports 5 languages:
- English (UK) - Primary
- German (de)
- French (fr)
- Italian (it)
- Spanish (es)

## Privacy & GDPR

SafeBite is fully GDPR compliant:
- Consent required before app use (EU/UK requirement)
- Data export available as JSON
- Account deletion with cascading data cleanup
- Firestore data stored in EU region
- Health data (severity level) requires explicit consent

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is proprietary software. All rights reserved.

## Support

For questions or support, please open an issue on GitHub.

---

**SafeBite** - Eat safely, anywhere in Europe.

## Web app (PWA) — private pilot

The active codebase is the web app in `web/` with callable functions in
`functions/`. The Swift project under `SafeBite/` is kept as a reference only.

### Prerequisites

- Node 22, npm 10
- Java 21+ (Firebase emulators)
- `npm ci` in `./`, `web/`, and `functions/`
- On WSL, keep the checkout on the Linux filesystem (for example `~/dev/AvaGF`), not `/mnt/c`: Windows-mounted paths make emulator cold starts take over a minute.

### Local development (emulators only)

```bash
npm run emu:start            # terminal 1: Auth, Firestore, Functions emulators (project demo-safebite)
npm run emu:seed             # terminal 2, once: creates ava@safebite.test / bogdan@safebite.test (members)
                             #                and stranger@safebite.test (not a member); password pilot-password-1
npm --prefix web run dev     # terminal 2: http://127.0.0.1:5173
```

> Discovery (the Discover tab) calls the `searchDestination` / `searchNearby` functions, which read the `PLACES_API_KEY` secret. Locally the emulator reads `functions/.secret.local` (gitignored); the `emu:*` scripts create it from `functions/.secret.local.example` (`PLACES_API_KEY=fixture`) when it is missing, which selects a fixture provider with twelve invented venues and the magic queries `__empty__`, `__unavailable__`, `__quota__`, `__delayed__` (3 s) and `__slow__` (25 s). To try real results locally, put a key restricted to Places API (New) in `.secret.local` — never commit it. Search is off until `config/discovery` exists (`{ enabled: true, dailySearchCap: 50 }`, written by `npm run emu:seed`).

Saved shows the household's shortlist by default; "All records" shows everything. Each restaurant has shortlist and visited controls plus "Our notes": notes are personal and never evidence. Deleting a restaurant also deletes both members' notes and its shortlist state. Settings has "Change password".

Emulator UI: http://127.0.0.1:4000
Records live under households/home/restaurants in the emulator; `npm run emu:e2e` clears them before each scenario via the emulator's REST API.

### Tests

```bash
npm run typecheck   # both packages
npm run test:unit   # web unit tests (no emulator)
npm run emu:test    # functions + Firestore rules tests (starts emulators)
npm run emu:e2e     # Playwright browser tests (starts emulators, seeds, runs Vite)
npm run emu:e2e:stress   # 42 browser scenarios × 3 repeats, retries disabled (flakiness gate)
npm --prefix web run build:check   # compile-only build (no Firebase config needed)
npm --prefix web run build:e2e        # builds the three synthetic bundles: dist-preview, dist-preview-v2, dist-boot-guard (fixtures in web/.env.preview, .env.preview-v2, .env.boot-guard)
npm --prefix web run e2e:boot-guard   # compile-only bundle with demo values refuses to start (Chromium, no emulators)
npm --prefix web run e2e:preview      # manifest, service worker, offline shell (Chromium, no emulators)
npm --prefix web run e2e:upgrade      # same-origin release upgrades and the update prompt (Chromium, no emulators)
npm --prefix web run icons            # re-render the PNG icon set from web/assets/safebite-mark.svg
```

`npm run test:unit` currently reports 361 tests. `npm run emu:test` currently reports 352 tests (functions + rules). `npm run emu:e2e` currently reports 42 browser scenarios.

### Guardrails

- Local work targets the emulator-only project `demo-safebite`. Nothing here deploys.
- Deploy order (spec §3.7): Firestore rules and functions first, then hosting; the deletion completion gate protects older cached clients.
- Membership (`users/{uid}`, `households/{hid}`) is written only with the Admin SDK; there is no sign-up.
- Never reuse the legacy seed data from git history; its safety claims were invented.
- `npm --prefix web run build` (used by `firebase deploy`) refuses missing, blank, demo-, or legacy-project Firebase values; the resulting bundle also refuses to start against them.
- Any `vite build` refuses to run with `NODE_ENV` set to anything but `production` (including via `.env` files), even for `build:check`. A built bundle's startup guard keys on the `__SAFEBITE_BUILD__` marker from `vite.config.ts`, not on `import.meta.env.PROD`, so `NODE_ENV` cannot switch it off.
- A misconfigured built bundle shows a plain "this build is misconfigured" screen, loads no Firebase code, unregisters every service worker, deletes every cache and leaves the old worker's control; a clean bundle registers the Workbox worker only after that check. A non-deployable build ships a self-destroying worker (no precache), so an installed worker that picks it up as an update never caches it and triggers a clean-up; the misconfiguration screen completes the purge (`npm --prefix web run e2e:upgrade` proves both paths).
- Updates are prompted, never forced: a new release shows a "new version ready" banner and only the tab whose Reload is tapped reloads; other open tabs get an "updated in another tab" banner and keep their typed input until they reload (`e2e:upgrade` proves both).
- The PWA icon set is generated, never hand-edited: change `web/assets/safebite-mark.svg` and run `npm --prefix web run icons`.
- The three synthetic test bundles are built only from the committed `web/.env.<mode>` fixtures: `vite build --mode preview|preview-v2|boot-guard` refuses to run if an exported `VITE_*` variable differs from the file, and every build writes `safebite-build.json` (mode, project id, source hash) that the `e2e:*` scripts verify, so a stale or wrong-mode dist is refused with the `build:<mode>` command to run.
- Records are member-only and written only through Firestore transactions (online-only; a save is reported as saved only after the server accepted it). Restaurants carry a `version` the rules require to increase by exactly one; claims are immutable (add/delete only); deleting a restaurant marks it, sweeps its claims, then removes it, and an interrupted deletion is resumed from the list.
- Evidence dates are UTC calendar days stored at 00:00 UTC; a claim needs rechecking 12 months after it was checked unless it carries its own expiry. Same-day contradicting claims are shown as "Conflicting evidence". No numerical score anywhere.
- Discovery is server-side only: the Places key is a Cloud Functions secret, every callable checks membership first, the field mask asks for id, name, address, Maps link, business status and types only (Pro tier; no coordinates, phone, website or ratings), Town or area searches request `food in <query>`, while Restaurant or venue name searches preserve the entered name; both make one request and the mapper keeps only restaurants, cafés, bakeries, bars and takeaways (no restaurant-only request filter), and nothing from a Places response is cached or stored — a record created from a result keeps only the place id; the member types the name and address. A deployed function whose secret is the fixture value refuses every search.
- Search fails closed: a missing or disabled config/discovery document refuses every search; each household has a per-day cap counted before the provider is called (failed calls count too). Results carry the Google Maps logo and are shown in Google's order; a listing says nothing about gluten-free safety.
