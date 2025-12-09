# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SafeBite is an iOS app for finding gluten-free restaurants across Europe and the UK. It helps people with coeliac disease find safe dining options through a three-tier trust verification system.

**Target:** iOS 17+, macOS 14+
**Tech Stack:** SwiftUI, The Composable Architecture (TCA), SwiftData, Firebase, MapKit, StoreKit 2

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
├── Map/              # Main map view with restaurant pins
├── Search/           # Restaurant search with filters
├── Saved/            # Saved/favorite restaurants with sorting/filtering
├── Profile/          # User settings, subscriptions
├── RestaurantDetail/ # Full restaurant info and safety checklist
├── Review/           # Review submission with safety quiz
├── Auth/             # Sign in/sign up flows
├── Subscription/     # Premium subscription paywall
└── GDPR/             # Privacy settings and data export
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

### PersistenceService (`Services/PersistenceService.swift`)
SwiftData-based persistence layer with singleton access:
```swift
PersistenceService.shared.container  // ModelContainer for SwiftUI
PersistenceService.shared.context    // MainActor ModelContext
```

**Models managed:**
- `Restaurant` - Core restaurant data with safety profile
- `Review` - User reviews with safety ratings
- `User` - User profile and preferences
- `SavedRestaurantEntity` - SwiftData entity for favorites
- `CachedRestaurant` - Google Places cache (24-hour TTL)

**Key operations:**
- `fetchSavedRestaurants()` / `saveRestaurantToFavorites(_:)`
- `exportUserData()` - Returns `UserDataExport` for GDPR export
- `deleteAllData()` - GDPR right to erasure

### AuthenticationService (`Services/AuthenticationService.swift`)
Firebase Auth wrapper (currently mocked for development):
```swift
AuthenticationService.shared.signIn(email:password:)
AuthenticationService.shared.signUp(email:password:displayName:)
AuthenticationService.shared.signInWithApple()  // Returns ASAuthorizationAppleIDRequest
AuthenticationService.shared.signOut()
AuthenticationService.shared.deleteAccount()
```

### SubscriptionService (`Services/SubscriptionService.swift`)
StoreKit 2 subscription handling:
```swift
SubscriptionService.shared.loadProducts()
SubscriptionService.shared.purchase(_:)  // Returns Transaction?
SubscriptionService.shared.restorePurchases()
```

**Product IDs:**
- `com.safebite.premium.monthly` - Monthly subscription
- `com.safebite.premium.yearly` - Yearly subscription (recommended)

### GooglePlacesService (`Services/GooglePlacesService.swift`)
Actor-based API client with 24-hour caching for Google Places API.

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

## Key Files

| File | Purpose |
|------|---------|
| `SafeBiteApp.swift` | App entry, root `AppFeature`, GDPR consent flow, onboarding |
| `Models/Restaurant.swift` | SwiftData model with `SafetyProfile`, `VerificationStatus` |
| `Models/TrustScore.swift` | Three-tier scoring logic and `TrustScoreBadge` view |
| `Models/User.swift` | User model, `SubscriptionTier`, `Language`, `Currency` enums |
| `Services/PersistenceService.swift` | SwiftData container, CRUD, GDPR export |
| `Services/AuthenticationService.swift` | Firebase Auth wrapper with Apple Sign In |
| `Services/SubscriptionService.swift` | StoreKit 2 subscription handling |
| `Services/GooglePlacesService.swift` | Actor-based API client with caching |
| `Features/Saved/SavedFeature.swift` | Favorites with sort/filter + `SavedRestaurantClient` |
| `Features/Auth/AuthFeature.swift` | Sign in/up flows + `AuthClient` dependency |
| `Features/Subscription/SubscriptionFeature.swift` | Paywall + `SubscriptionClient` dependency |
| `Features/GDPR/GDPRFeature.swift` | Data export/delete + consent settings |
| `Features/Review/ReviewFeature.swift` | Review submission + `SafetyQuizState` |

## Data Models

### SubscriptionTier
```swift
enum SubscriptionTier: String {
    case free
    case premiumMonthly
    case premiumYearly
    case premium  // Legacy, maps to yearly
}
```

### PriceLevel
```swift
enum PriceLevel: Int {
    case budget = 1
    case moderate = 2
    case expensive = 3
    case luxury = 4
}
```

## Localization

5 languages supported (Resources directory):
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
- `GDPRConsentView` - Initial consent screen (blocks app)
- `GDPRConsentBanner` - Cookie-style banner component
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
- **GoogleService-Info.plist:** Added to SafeBite/SafeBite/
- **Services:** Auth, Firestore, Crashlytics enabled
- **Region:** Configure Firestore in `europe-west1` or `europe-west2` for GDPR

To enable Analytics in Firebase Console:
1. Go to Project Settings > Integrations
2. Enable Google Analytics

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
