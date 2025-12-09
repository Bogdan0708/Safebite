# Repository Guidelines

## Project Structure & Module Organization
- `SafeBite/SafeBite`: SwiftUI + TCA sources grouped by domain (e.g. `Features/Map`, `Models`, `Services`, `Resources`).
- `SafeBite/SafeBiteTests` and `SafeBite/SafeBiteUITests`: reserved for unit/UI tests (add new suites here).
- `Resources/*.lproj`: localization bundles; keep `Localizable.strings` keys synchronized across languages.
- `Package.swift`: SwiftPM manifest specifying dependencies (TCA, Firebase, Kingfisher) and minimum platform versions (iOS 17, macOS 14).

## Build, Test, and Development Commands
- `swift build` (run inside `SafeBite/`): compiles sources and resolves dependencies.
- `swift test`: executes `SafeBiteTests`; add focused test targets before expanding UI tests.
- `open Package.swift`: opens the SwiftPM workspace in Xcode for iOS simulator/device debugging.
- When running locally, export `GOOGLE_PLACES_API_KEY` and configure Firebase via Xcode's signing settings for real data.

## Coding Style & Naming Conventions
- Follow Swift API Design Guidelines: UpperCamelCase for types/features (`MapFeature`), lowerCamelCase for values/actions (`savedRestaurants`, `requestLocationPermission`).
- Use 4-space indentation and keep files ASCII unless localization requires otherwise.
- Views pair with reducers (`Feature.swift` + `FeatureView.swift`). Keep TCA `State`, `Action`, and reducer logic in the feature file; UI-only helpers stay in the view file.

## Testing Guidelines
- Prefer TCA `TestStore`-driven unit tests; name methods as `test_<Feature>_<Scenario>()`.
- Add regression tests for trust scoring, filtering, and GDPR gating before merging new flows.
- Snapshot/UI tests belong in `SafeBiteUITests`; tag async map/location tests with `@MainActor`.

## Commit & Pull Request Guidelines
- Use conventional, descriptive commits (`feat: add SavedFeature filtering`, `fix: persist GDPR consent`). Squash trivial WIP commits before opening PRs.
- PRs should include: summary of changes, testing evidence (`swift test` output), and screenshots for UI updates (map, onboarding, GDPR screens).
- Link Jira/GitHub issues where available, and call out any manual configuration steps (API keys, Firebase settings) in the description.

## Security & Configuration Tips
- Never commit API keys or Firebase plist files; rely on `.xcconfig` or environment variables.
- Keep GDPR storage promises: use `PersistenceService` helpers for export/delete flows and avoid writing health data to `UserDefaults`.

---

## Recent Changes (December 2024)

### Firebase Integration (Production Ready)
- **SafeBiteApp.swift**: Added `AppDelegate` for Firebase initialization with `FirebaseApp.configure()`
- **Package.swift**: Added `FirebaseCrashlytics` to dependencies
- **AuthenticationService.swift**: Fully enabled Firebase Auth with:
  - Email/password authentication
  - Apple Sign In with OAuth credential flow
  - User document creation in Firestore
  - Account deletion with cascading data cleanup (GDPR compliant)
  - Proper error mapping from Firebase error codes

### New Services Added
1. **FirestoreService.swift**: Actor-based Firestore client for:
   - Restaurant CRUD operations
   - Review submission with transaction-based rating updates
   - Saved restaurants (user subcollection)
   - Incident reports
   - Trust score data retrieval
   - 100MB offline persistence cache configured

2. **AnalyticsService.swift**: Firebase Analytics wrapper with events for:
   - Screen tracking
   - Restaurant views/saves
   - Review submissions
   - Safety quiz completion
   - Subscription funnel
   - GDPR actions
   - Error logging

### Firestore Configuration Files
- **firestore.rules**: Security rules with:
  - User-owned document access
  - Public read for restaurants/reviews
  - Admin-only write for restaurants
  - GDPR-compliant user data deletion

- **firestore.indexes.json**: Composite indexes for:
  - Reviews by restaurant + date
  - Reviews by user + date
  - Restaurants by active + city
  - Incidents by restaurant/user

### Test Suite Created
- `SafeBiteTests/TrustScoreTests.swift`: Trust score calculation and level mapping
- `SafeBiteTests/SafetyProfileTests.swift`: Safety profile and certification tests
- `SafeBiteTests/GDPRFeatureTests.swift`: GDPR consent and data deletion flows
- `SafeBiteTests/AuthenticationTests.swift`: AuthUser model and email validation

---

## Firebase Setup Required

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project named "SafeBite" or "SafeBite-Production"
3. Enable Google Analytics with EU reporting location

### Step 2: Configure Firestore (EU Region)
1. Go to Build > Firestore Database
2. Create database in `europe-west1` (Belgium) or `europe-west2` (London)
3. Deploy security rules: `firebase deploy --only firestore:rules`
4. Deploy indexes: `firebase deploy --only firestore:indexes`

### Step 3: Enable Authentication
1. Go to Build > Authentication
2. Enable Email/Password provider
3. Enable Apple Sign In provider (requires Apple Developer account)

### Step 4: Add GoogleService-Info.plist
1. Download from Firebase Console > Project Settings > iOS app
2. Place in `SafeBite/SafeBite/` directory
3. Add to Xcode target (do NOT commit to git)

### Step 5: Configure Crashlytics
1. Go to Build > Crashlytics
2. Follow setup wizard
3. Add build phase script for dSYM upload (Xcode Cloud handles this automatically)

---

## Production Readiness Checklist

### Required Before App Store Submission
- [ ] Firebase project created with EU region
- [ ] `GoogleService-Info.plist` added to Xcode project
- [ ] Apple Developer account configured for Sign in with Apple
- [ ] StoreKit products created in App Store Connect
- [ ] Privacy Policy URL deployed
- [ ] App Review information prepared

### Environment Configuration
```bash
# Development
export GOOGLE_PLACES_API_KEY="your-dev-key"

# Production (use Xcode build settings or .xcconfig)
# GOOGLE_PLACES_API_KEY = $(GOOGLE_PLACES_API_KEY_PROD)
```

### Firestore Collections Schema
```
/users/{userId}
  - email: string
  - displayName: string
  - severityLevel: string ("coeliac", "ncgs", "wheat_allergy", "preference")
  - isPremium: boolean
  - isVerifiedReviewer: boolean
  - gdprConsentGiven: boolean
  - gdprConsentDate: timestamp

  /savedRestaurants/{restaurantId}
    - restaurantName: string
    - city: string
    - trustScore: number
    - savedAt: timestamp

/restaurants/{restaurantId}
  - googlePlaceId: string
  - name: string
  - address: string
  - city: string
  - country: string
  - latitude: number
  - longitude: number
  - hasDedicatedKitchen: boolean
  - hasSeparateFryer: boolean
  - certifications: array<string>
  - verificationMethod: string
  - professionalScore: number
  - reviewCount: number
  - averageSafetyRating: number

/reviews/{reviewId}
  - restaurantId: string
  - userId: string
  - content: string
  - safetyRating: number (1-5)
  - foodRating: number (1-5)
  - hadReaction: boolean
  - isVerifiedReviewer: boolean
  - createdAt: timestamp

/incidents/{incidentId}
  - restaurantId: string
  - userId: string
  - description: string
  - severity: string ("mild", "moderate", "severe")
  - incidentDate: timestamp

/trustScores/{restaurantId}
  - professionalScore: number (0-40)
  - communityScore: number (0-35)
  - freshnessScore: number (0-25)
  - totalScore: number (0-100)
  - trustLevel: string
```
