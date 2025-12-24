import Foundation

/// App configuration constants
enum Config {
    /// Google Places API key for restaurant search
    /// Reads from Info.plist (set via xcconfig) or falls back to environment variable
    static let googlePlacesAPIKey: String = {
        // Try Info.plist first (set via xcconfig)
        if let key = Bundle.main.object(forInfoDictionaryKey: "GOOGLE_PLACES_API_KEY") as? String,
           !key.isEmpty, key != "$(GOOGLE_PLACES_API_KEY)" {
            return key
        }
        // Fall back to environment variable
        if let key = ProcessInfo.processInfo.environment["GOOGLE_PLACES_API_KEY"],
           !key.isEmpty {
            return key
        }
        // Return empty - will use mock data
        return ""
    }()

    /// App bundle identifier
    static let bundleIdentifier = "com.mitch.safebite"

    /// Firebase project region (for GDPR compliance)
    static let firebaseRegion = "europe-west1"

    /// StoreKit product identifiers
    enum Products {
        static let premiumMonthly = "com.safebite.premium.monthly"
        static let premiumYearly = "com.safebite.premium.yearly"
    }

    /// App URLs
    enum URLs {
        static let privacyPolicy = URL(string: "https://safebite.app/privacy")!
        static let termsOfService = URL(string: "https://safebite.app/terms")!
        static let support = URL(string: "https://safebite.app/support")!
    }
}
