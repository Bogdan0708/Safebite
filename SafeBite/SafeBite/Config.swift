import Foundation

/// App configuration constants
enum Config {
    /// Google Places API key for restaurant search
    static let googlePlacesAPIKey = "AIzaSyDnSM49t1DK0pib2QayLFjf6IlCkaPhBhE"

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
