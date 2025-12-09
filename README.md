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
