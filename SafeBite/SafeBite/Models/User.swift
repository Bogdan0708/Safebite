import Foundation
import SwiftData

/// A SafeBite user
@Model
final class User {
    @Attribute(.unique) var id: String

    // MARK: - Profile
    var email: String
    var displayName: String
    var profilePhotoURL: String?
    var bio: String?

    // MARK: - Health Profile
    /// User's gluten sensitivity level
    var severityLevel: GlutenSeverityLevel

    /// Additional allergens beyond gluten
    var additionalAllergens: [Allergen]

    /// User's notes about their dietary needs
    var dietaryNotes: String?

    // MARK: - Verification Status
    /// Has user passed the safety knowledge quiz?
    var hasPassedSafetyQuiz: Bool

    /// Date quiz was passed
    var safetyQuizPassedDate: Date?

    /// User's quiz score (percentage)
    var safetyQuizScore: Int?

    /// Is user a "Local Guide" for their area?
    var isLocalGuide: Bool

    /// Cities where user is a local guide
    var localGuideCities: [String]

    // MARK: - Preferences
    var preferredLanguage: Language
    var preferredCurrency: Currency
    var notificationsEnabled: Bool
    var locationSharingEnabled: Bool

    // MARK: - Activity
    var reviewCount: Int
    var helpfulVotesReceived: Int
    var savedRestaurants: [String] // Restaurant IDs
    var recentSearches: [String]

    // MARK: - Subscription
    var subscriptionTier: SubscriptionTier
    var subscriptionExpiresAt: Date?

    // MARK: - GDPR
    var gdprConsentDate: Date?
    var marketingConsentGiven: Bool
    var analyticsConsentGiven: Bool

    // MARK: - Metadata
    var createdAt: Date
    var lastActiveAt: Date

    init(
        id: String = UUID().uuidString,
        email: String,
        displayName: String,
        severityLevel: GlutenSeverityLevel = .celiac,
        additionalAllergens: [Allergen] = [],
        preferredLanguage: Language = .english,
        preferredCurrency: Currency = .eur
    ) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.severityLevel = severityLevel
        self.additionalAllergens = additionalAllergens
        self.preferredLanguage = preferredLanguage
        self.preferredCurrency = preferredCurrency

        // Defaults
        self.hasPassedSafetyQuiz = false
        self.isLocalGuide = false
        self.localGuideCities = []
        self.notificationsEnabled = true
        self.locationSharingEnabled = false
        self.reviewCount = 0
        self.helpfulVotesReceived = 0
        self.savedRestaurants = []
        self.recentSearches = []
        self.subscriptionTier = .free
        self.marketingConsentGiven = false
        self.analyticsConsentGiven = false
        self.createdAt = Date()
        self.lastActiveAt = Date()
    }
}

// MARK: - Supporting Types

enum Allergen: String, Codable, CaseIterable {
    case dairy = "Dairy"
    case eggs = "Eggs"
    case fish = "Fish"
    case shellfish = "Shellfish"
    case treeNuts = "Tree Nuts"
    case peanuts = "Peanuts"
    case soy = "Soy"
    case sesame = "Sesame"
    case mustard = "Mustard"
    case celery = "Celery"
    case lupin = "Lupin"
    case molluscs = "Molluscs"
    case sulphites = "Sulphites"

    var icon: String {
        switch self {
        case .dairy: return "drop.fill"
        case .eggs: return "oval.fill"
        case .fish: return "fish.fill"
        case .shellfish: return "tortoise.fill"
        case .treeNuts, .peanuts: return "leaf.fill"
        case .soy: return "leaf.circle.fill"
        case .sesame: return "circle.grid.3x3.fill"
        default: return "exclamationmark.triangle.fill"
        }
    }
}

enum Language: String, Codable, CaseIterable {
    case english = "en"
    case german = "de"
    case french = "fr"
    case italian = "it"
    case spanish = "es"

    var displayName: String {
        switch self {
        case .english: return "English"
        case .german: return "Deutsch"
        case .french: return "Français"
        case .italian: return "Italiano"
        case .spanish: return "Español"
        }
    }

    var flag: String {
        switch self {
        case .english: return "🇬🇧"
        case .german: return "🇩🇪"
        case .french: return "🇫🇷"
        case .italian: return "🇮🇹"
        case .spanish: return "🇪🇸"
        }
    }
}

enum Currency: String, Codable, CaseIterable {
    case eur = "EUR"
    case gbp = "GBP"
    case chf = "CHF"

    var symbol: String {
        switch self {
        case .eur: return "€"
        case .gbp: return "£"
        case .chf: return "CHF"
        }
    }
}

enum SubscriptionTier: String, Codable, CaseIterable {
    case free = "Free"
    case premiumMonthly = "Premium Monthly"
    case premiumYearly = "Premium Yearly"
    case premium = "Premium" // Legacy, maps to yearly

    var isPremium: Bool {
        self != .free
    }

    var price: String {
        switch self {
        case .free: return "Free"
        case .premiumMonthly: return "£3.99/month"
        case .premiumYearly, .premium: return "£29.99/year"
        }
    }

    var displayName: String {
        switch self {
        case .free: return "Free"
        case .premiumMonthly: return "Premium"
        case .premiumYearly, .premium: return "Premium"
        }
    }

    var features: [String] {
        switch self {
        case .free:
            return [
                "Basic search",
                "View trust scores",
                "Save 5 restaurants",
                "Read reviews"
            ]
        case .premiumMonthly, .premiumYearly, .premium:
            return [
                "Unlimited saves",
                "Cloud sync",
                "Safety alerts",
                "Detailed reports",
                "Offline access",
                "Priority support"
            ]
        }
    }

    // For backwards compatibility
    static var family: SubscriptionTier { .premiumYearly }

    var legacyFeatures: [String] {
        switch self {
        case .free:
            return [
                "Basic search",
                "View trust scores",
                "10 searches/day",
                "Read limited reviews"
            ]
        case .premiumMonthly, .premiumYearly, .premium:
            return [
                "Unlimited searches",
                "Full trust score breakdown",
                "Offline city downloads",
                "Route planning",
                "Advanced filters",
                "Collections",
                "Ad-free"
            ]
        }
    }

    // Placeholder for legacy family tier features
    static var familyFeatures: [String] {
        [
            "All Premium features",
            "Up to 5 accounts",
                "Shared collections",
                "Priority support"
            ]
        }
    }
}

// MARK: - User Extensions

extension User {
    /// Whether user can leave verified reviews
    var canLeaveVerifiedReviews: Bool {
        hasPassedSafetyQuiz
    }

    /// User's badge based on activity
    var badge: UserBadge {
        if isLocalGuide {
            return .localGuide
        } else if reviewCount >= 50 && hasPassedSafetyQuiz {
            return .trustedReviewer
        } else if hasPassedSafetyQuiz {
            return .verified
        } else {
            return .none
        }
    }

    /// Whether user has an active premium subscription
    var isPremium: Bool {
        switch subscriptionTier {
        case .free: return false
        case .premium, .family:
            guard let expiresAt = subscriptionExpiresAt else { return false }
            return expiresAt > Date()
        }
    }
}

enum UserBadge: String {
    case none = ""
    case verified = "Verified"
    case trustedReviewer = "Trusted Reviewer"
    case localGuide = "Local Guide"

    var icon: String {
        switch self {
        case .none: return ""
        case .verified: return "checkmark.seal.fill"
        case .trustedReviewer: return "star.fill"
        case .localGuide: return "mappin.circle.fill"
        }
    }

    var color: String {
        switch self {
        case .none: return "gray"
        case .verified: return "blue"
        case .trustedReviewer: return "orange"
        case .localGuide: return "green"
        }
    }
}
