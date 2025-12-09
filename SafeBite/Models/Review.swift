import Foundation
import SwiftData

/// A user review of a restaurant's gluten-free offerings
@Model
final class Review {
    @Attribute(.unique) var id: String

    // MARK: - Review Content
    var title: String?
    var content: String
    var rating: Int // 1-5 stars for food quality
    var safetyRating: Int // 1-5 stars for GF safety

    // MARK: - Critical Safety Data
    /// Did the reviewer experience a gluten reaction?
    var hadReaction: Bool

    /// Severity of reaction if one occurred
    var reactionSeverity: ReactionSeverity?

    /// Description of reaction symptoms
    var reactionDescription: String?

    // MARK: - Staff & Experience
    /// Rating of staff knowledge about gluten-free (1-5)
    var staffKnowledgeRating: Int

    /// What the reviewer ordered
    var itemsOrdered: [String]

    /// Were staff responsive to questions?
    var staffResponsive: Bool

    // MARK: - Photos
    /// URLs of photos attached to review
    var photoURLs: [String]

    /// Did reviewer include menu photo?
    var hasMenuPhoto: Bool

    /// Did reviewer include dish photo?
    var hasDishPhoto: Bool

    // MARK: - Reviewer Info
    var userId: String
    var userName: String
    var userSeverityLevel: GlutenSeverityLevel

    /// Has this reviewer passed the safety quiz?
    var isVerifiedReviewer: Bool

    /// Reviewer's total review count
    var reviewerReviewCount: Int

    // MARK: - Metadata
    var createdAt: Date
    var updatedAt: Date

    /// How many users found this helpful
    var helpfulCount: Int

    /// Has restaurant responded to this review?
    var hasRestaurantResponse: Bool
    var restaurantResponse: String?
    var restaurantResponseDate: Date?

    // MARK: - Relationship
    var restaurant: Restaurant?

    init(
        id: String = UUID().uuidString,
        content: String,
        rating: Int,
        safetyRating: Int,
        hadReaction: Bool = false,
        reactionSeverity: ReactionSeverity? = nil,
        staffKnowledgeRating: Int,
        itemsOrdered: [String] = [],
        staffResponsive: Bool = true,
        photoURLs: [String] = [],
        hasMenuPhoto: Bool = false,
        hasDishPhoto: Bool = false,
        userId: String,
        userName: String,
        userSeverityLevel: GlutenSeverityLevel,
        isVerifiedReviewer: Bool = false,
        reviewerReviewCount: Int = 0
    ) {
        self.id = id
        self.content = content
        self.rating = rating
        self.safetyRating = safetyRating
        self.hadReaction = hadReaction
        self.reactionSeverity = reactionSeverity
        self.staffKnowledgeRating = staffKnowledgeRating
        self.itemsOrdered = itemsOrdered
        self.staffResponsive = staffResponsive
        self.photoURLs = photoURLs
        self.hasMenuPhoto = hasMenuPhoto
        self.hasDishPhoto = hasDishPhoto
        self.userId = userId
        self.userName = userName
        self.userSeverityLevel = userSeverityLevel
        self.isVerifiedReviewer = isVerifiedReviewer
        self.reviewerReviewCount = reviewerReviewCount
        self.createdAt = Date()
        self.updatedAt = Date()
        self.helpfulCount = 0
        self.hasRestaurantResponse = false
    }
}

// MARK: - Enums

enum ReactionSeverity: String, Codable, CaseIterable {
    case mild = "Mild"
    case moderate = "Moderate"
    case severe = "Severe"

    var description: String {
        switch self {
        case .mild: return "Minor discomfort, resolved quickly"
        case .moderate: return "Noticeable symptoms for several hours"
        case .severe: return "Significant symptoms requiring rest/medication"
        }
    }

    var color: String {
        switch self {
        case .mild: return "yellow"
        case .moderate: return "orange"
        case .severe: return "red"
        }
    }
}

enum GlutenSeverityLevel: String, Codable, CaseIterable {
    case celiac = "Coeliac Disease"
    case ncgs = "Non-Coeliac Gluten Sensitivity"
    case wheatAllergy = "Wheat Allergy"
    case preference = "Gluten-Free Preference"

    var description: String {
        switch self {
        case .celiac:
            return "Autoimmune condition requiring strict zero gluten"
        case .ncgs:
            return "Sensitivity to gluten with varying tolerance"
        case .wheatAllergy:
            return "Allergic to wheat proteins (not necessarily gluten)"
        case .preference:
            return "Choosing gluten-free for lifestyle reasons"
        }
    }

    var icon: String {
        switch self {
        case .celiac: return "exclamationmark.shield.fill"
        case .ncgs: return "shield.fill"
        case .wheatAllergy: return "allergens"
        case .preference: return "leaf.fill"
        }
    }

    /// Whether this reviewer's experience is relevant for strict coeliacs
    var isRelevantForCeliac: Bool {
        switch self {
        case .celiac, .ncgs: return true
        case .wheatAllergy, .preference: return false
        }
    }
}

// MARK: - Review Summary

struct ReviewSummary {
    let totalReviews: Int
    let averageRating: Double
    let averageSafetyRating: Double
    let safeExperiences: Int
    let reactionReports: Int
    let verifiedReviewerCount: Int

    var safetyPercentage: Double {
        guard totalReviews > 0 else { return 0 }
        return Double(safeExperiences) / Double(totalReviews) * 100
    }

    init(reviews: [Review]) {
        self.totalReviews = reviews.count
        self.averageRating = reviews.isEmpty ? 0 : Double(reviews.map(\.rating).reduce(0, +)) / Double(reviews.count)
        self.averageSafetyRating = reviews.isEmpty ? 0 : Double(reviews.map(\.safetyRating).reduce(0, +)) / Double(reviews.count)
        self.safeExperiences = reviews.filter { !$0.hadReaction }.count
        self.reactionReports = reviews.filter { $0.hadReaction }.count
        self.verifiedReviewerCount = reviews.filter { $0.isVerifiedReviewer }.count
    }
}

// MARK: - Review Extensions

extension Review {
    /// Whether this review should be highlighted (verified + safe + recent)
    var isHighlighted: Bool {
        isVerifiedReviewer &&
        !hadReaction &&
        safetyRating >= 4 &&
        createdAt > Calendar.current.date(byAdding: .month, value: -3, to: Date())!
    }

    /// Display-friendly date
    var relativeDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: createdAt, relativeTo: Date())
    }
}
