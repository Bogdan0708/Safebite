# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SafeBite is an iOS app for finding gluten-free restaurants across Europe and the UK. It helps people with coeliac disease find safe dining options through a three-tier trust verification system.

**Target:** iOS 17+, macOS 14+
**Tech Stack:** SwiftUI, The Composable Architecture (TCA), SwiftData, Firebase, MapKit, StoreKit 2

## Project Structure

**Important:** Source files are located in `SafeBite/SafeBite/` (nested structure due to SPM configuration).

```
AvaGF/
├── Package.swift              # SPM package definition (path: "SafeBite")
├── CLAUDE.md                  # This file
├── SafeBite/
│   ├── .build/                # SPM build artifacts (ignore)
│   └── SafeBite/              # Actual source files
│       ├── SafeBiteApp.swift  # App entry point + AppFeature
│       ├── GoogleService-Info.plist
│       ├── Components/        # Empty - reserved for reusable UI
│       ├── Features/          # 9 TCA feature modules
│       ├── Models/            # 5 SwiftData models
│       ├── Services/          # 6 service singletons
│       └── Resources/         # Localization files
└── SafeBiteTests/             # Test target (placeholder)
```

## Build Commands

```bash
# Build the project
swift build

# Run tests
swift test

# Open in Xcode (recommended for iOS development)
open Package.swift
```

Since this is a Swift Package Manager project, use Xcode for running on simulators and devices.

## Architecture

### TCA (The Composable Architecture) Pattern

Every feature follows the TCA pattern with paired files:
- `*Feature.swift` - Contains `@Reducer` with State, Action, and reducer body
- `*View.swift` - SwiftUI view using `@Bindable var store: StoreOf<Feature>`

```
Features/
├── Map/              # Main map view with restaurant pins (601 lines)
├── Search/           # Restaurant search with filters (211 lines)
├── Saved/            # Saved/favorite restaurants with sorting/filtering (435 lines)
├── Profile/          # User settings, subscriptions (326 lines)
├── RestaurantDetail/ # Full restaurant info and safety checklist (295 lines)
├── Review/           # Review submission with safety quiz (356 lines)
├── Auth/             # Sign in/sign up flows (259 lines)
├── Subscription/     # Premium subscription paywall (277 lines)
└── GDPR/             # Privacy settings and data export (299 lines)
```

**Root Reducer:** `AppFeature` in `SafeBiteApp.swift` composes all child features using `Scope`.

### App Flow

1. **GDPR Consent** - Blocks app until user consents (EU/UK requirement)
2. **Onboarding** - 4-page introduction explaining trust scores
3. **Main App** - Tab bar with Map, Search, Saved, Profile

### Three-Tier Trust Score System

The core differentiator - transparent trust scoring in `Models/TrustScore.swift`:
- **Professional Score (0-40):** Verification from dietitians, certifications, owner questionnaires
- **Community Score (0-35):** Reviews from verified users, weighted by reaction reports
- **Freshness Score (0-25):** Decays based on time since last verification/review

Trust levels: Verified Safe (80+), Community Safe (60-79), Use Caution (30-59), Unverified (<30)

### Safety Profile

`Restaurant.safetyProfile` tracks critical safety factors:
- `hasDedicatedKitchen` - Separate GF preparation area
- `hasSeparateFryer` - Critical for cross-contamination
- `hasTrainedStaff` - AllerTrain, ServSafe, Coeliac UK certified
- `certifications` - Coeliac UK, AIC (Italy), DZG (Germany), GFCO, GFFP

### Verified Reviewer System

Users must pass a 10-question safety quiz (`SafetyQuizState` in `ReviewFeature.swift`) to become verified reviewers. Quiz covers coeliac basics, cross-contamination, hidden gluten sources.

## Services

All services are in `SafeBite/SafeBite/Services/`:

### PersistenceService (`PersistenceService.swift`)
SwiftData-based persistence layer with singleton access:
```swift
PersistenceService.shared.container  // ModelContainer for SwiftUI
PersistenceService.shared.context    // MainActor ModelContext
```

**Models managed:**
- `Restaurant` - Core restaurant data with safety profile
- `Review` - User reviews with safety ratings
- `User` - User profile and preferences
- `IncidentReport` - Contamination incident reports
- `SavedRestaurantEntity` - SwiftData entity for favorites
- `CachedRestaurant` - Google Places cache (24-hour TTL)

**Key operations:**
- `fetchSavedRestaurants()` / `saveRestaurantToFavorites(_:)`
- `exportUserData()` - Returns `UserDataExport` for GDPR export
- `deleteAllData()` - GDPR right to erasure

### AuthenticationService (`AuthenticationService.swift`)
Firebase Auth wrapper:
```swift
AuthenticationService.shared.signIn(email:password:)
AuthenticationService.shared.signUp(email:password:displayName:)
AuthenticationService.shared.signInWithApple()
AuthenticationService.shared.signOut()
AuthenticationService.shared.deleteAccount()
```

### SubscriptionService (`SubscriptionService.swift`)
StoreKit 2 subscription handling:
```swift
SubscriptionService.shared.loadProducts()
SubscriptionService.shared.purchase(_:)  // Returns Transaction?
SubscriptionService.shared.restorePurchases()
```

**Product IDs:**
- `com.safebite.premium.monthly` - Monthly subscription
- `com.safebite.premium.yearly` - Yearly subscription (recommended)

### GooglePlacesService (`GooglePlacesService.swift`)
Actor-based API client with 24-hour caching:
- `searchNearby(latitude:longitude:radius:types:)` - Find restaurants
- `searchByText(query:latitude:longitude:radius:)` - Text search
- `getPlaceDetails(placeId:)` - Full place info

### FirestoreService (`FirestoreService.swift`)
Firebase Firestore CRUD operations:
- Restaurant, User, Review, IncidentReport collections
- `syncLocalDataWithFirebase()` - Sync local SwiftData with cloud

### AnalyticsService (`AnalyticsService.swift`)
Firebase Analytics wrapper:
- Event tracking (views, searches, reviews, purchases)
- User properties
- Crashlytics integration

## Dependencies (TCA Pattern)

All external services are wrapped in TCA dependencies:

| Dependency | Purpose |
|------------|---------|
| `@Dependency(\.restaurantClient)` | Fetch restaurants from Google Places |
| `@Dependency(\.locationClient)` | CLLocationManager wrapper with async streams |
| `@Dependency(\.authClient)` | Authentication operations |
| `@Dependency(\.subscriptionClient)` | StoreKit subscription operations |
| `@Dependency(\.gdprClient)` | Data export and deletion |
| `@Dependency(\.savedRestaurantClient)` | Saved restaurants CRUD |

## Models

All models in `SafeBite/SafeBite/Models/` are SwiftData `@Model` classes:

| Model | Purpose |
|-------|---------|
| `Restaurant.swift` | Core restaurant with SafetyProfile, VerificationStatus, coordinates |
| `User.swift` | User profile, subscription, preferences, verification status |
| `Review.swift` | User reviews with safety ratings, reaction reports |
| `IncidentReport.swift` | Cross-contamination incident reports |
| `TrustScore.swift` | Three-tier scoring logic + `TrustScoreBadge` UI component |

### Key Enums

```swift
// User.swift
enum SubscriptionTier: String { case free, premiumMonthly, premiumYearly, premium }
enum GlutenSeverityLevel: String { case coeliac, sensitive, intolerant }
enum Language: String { case english, german, french, italian, spanish }
enum Currency: String { case eur, gbp, chf }

// Restaurant.swift
enum PriceLevel: Int { case budget = 1, moderate = 2, expensive = 3, luxury = 4 }

// Review.swift
enum ReactionSeverity: String { case mild, moderate, severe, hospitalized }
```

## Localization

5 languages supported in `SafeBite/SafeBite/Resources/`:
- English (UK) - Primary (`Localizable.strings`)
- German (`de.lproj/`)
- French (`fr.lproj/`)
- Italian (`it.lproj/`)
- Spanish (`es.lproj/`)

~100 strings including safety terminology and "What to Ask" restaurant prompts.

## GDPR Compliance

Mandatory for EU/UK market:
- `gdprConsentGiven` state blocks app until consent
- Health data (dietary preferences) requires explicit consent
- Firebase region: `europe-west1`
- Export data: JSON file with user profile, saved restaurants, reviews
- Delete account: Removes all data from SwiftData and Firebase
- Consent toggles: Analytics, Marketing, Personalization

### GDPR Views
- `GDPRConsentView` - Initial consent screen in `SafeBiteApp.swift`
- `GDPRView` - Full privacy settings with export/delete

## Domain Terminology

- **Coeliac** (not Celiac) - UK spelling used throughout
- **Cross-contamination** - GF food touching gluten surfaces/equipment
- **Dedicated fryer** - Separate fryer for GF items only (critical safety factor)
- **Verified reviewer** - User who passed the safety quiz

## Development Notes

### Firebase Setup (CONFIGURED)
Firebase is fully configured:
- **Bundle ID:** `com.mitch.safebite`
- **Project ID:** `safebite-production-13ba1`
- **GoogleService-Info.plist:** Located in `SafeBite/SafeBite/`
- **Services:** Auth, Firestore, Analytics, Crashlytics enabled
- **Region:** Configure Firestore in `europe-west1` or `europe-west2` for GDPR

### Mock Data
Services return mock data for development:
- `AuthenticationService` stores mock users in UserDefaults
- `SavedRestaurantClient.testValue` returns mock saved restaurants
- `SubscriptionClient.testValue` returns test products

### API Keys
Google Places API key should be set in environment or config:
```swift
let apiKey = ProcessInfo.processInfo.environment["GOOGLE_PLACES_API_KEY"] ?? ""
```

## Known Issues / TODOs

1. **Components directory empty** - `SafeBite/SafeBite/Components/` exists but has no files; reserved for reusable UI components

2. **Missing child features** - `RestaurantDetailFeature` references:
   - `WriteReviewFeature` - Not implemented
   - `ReportIncidentFeature` - Not implemented
   These are referenced in the reducer but the feature files don't exist.

3. **LocationManager** - Custom singleton in `MapFeature.swift` with:
   - `requestAuthorization()` - async/await wrapped
   - `locationStream()` - AsyncStream of coordinates
   - `getCurrentLocation()` - Returns CLLocationCoordinate2D

## File Reference

| File (relative to SafeBite/SafeBite/) | Lines | Purpose |
|---------------------------------------|-------|---------|
| `SafeBiteApp.swift` | 451 | App entry, AppFeature, GDPR/Onboarding views |
| `Features/Map/MapFeature.swift` | 601 | Map reducer + LocationManager |
| `Features/Map/MapView.swift` | ~400 | Map UI with annotations |
| `Features/Saved/SavedFeature.swift` | 435 | Favorites with sort/filter |
| `Services/PersistenceService.swift` | 500 | SwiftData container, CRUD |
| `Services/AuthenticationService.swift` | 437 | Firebase Auth wrapper |
| `Services/GooglePlacesService.swift` | 400 | Actor-based API client |
| `Services/FirestoreService.swift` | 376 | Firestore CRUD |
| `Models/Restaurant.swift` | 373 | SwiftData model with SafetyProfile |
| `Models/User.swift` | 313 | User model with preferences |
