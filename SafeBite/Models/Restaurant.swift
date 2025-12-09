import Foundation
import SwiftData
import CoreLocation

/// A restaurant with gluten-free dining options
@Model
final class Restaurant {
    // MARK: - Basic Info (from Google Places / TripAdvisor)
    @Attribute(.unique) var id: String
    var name: String
    var address: String
    var city: String
    var country: String
    var latitude: Double
    var longitude: Double
    var phoneNumber: String?
    var website: String?
    var cuisineTypes: [String]
    var priceLevel: PriceLevel
    var photoURLs: [String]
    var openingHours: [DayHours]?

    // MARK: - Google Places Data
    var googleRating: Double?
    var googleRatingCount: Int?
    var isOpenNow: Bool?
    var openingHoursText: [String]?

    // MARK: - Safety Profile (Our Data)
    var safetyProfile: SafetyProfile

    // MARK: - Verification Status
    var verificationStatus: VerificationStatus

    // MARK: - Community Data
    @Relationship(deleteRule: .cascade) var reviews: [Review]
    @Relationship(deleteRule: .cascade) var incidents: [IncidentReport]
    var lastCheckIn: Date?

    // MARK: - Computed Properties

    var trustScore: TrustScore {
        TrustScore(
            professionalScore: verificationStatus.professionalScore,
            communityScore: calculateCommunityScore(),
            freshnessScore: calculateFreshnessScore()
        )
    }

    /// Primary cuisine type for display
    var cuisineType: String {
        cuisineTypes.first ?? "Restaurant"
    }

    /// CLLocationCoordinate2D for MapKit
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    // MARK: - Source Metadata
    var googlePlaceId: String?
    var tripAdvisorId: String?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        name: String,
        address: String,
        city: String,
        country: String,
        latitude: Double,
        longitude: Double,
        phoneNumber: String? = nil,
        website: String? = nil,
        cuisineTypes: [String] = [],
        priceLevel: PriceLevel = .moderate,
        photoURLs: [String] = [],
        openingHours: [DayHours]? = nil,
        googleRating: Double? = nil,
        googleRatingCount: Int? = nil,
        isOpenNow: Bool? = nil,
        openingHoursText: [String]? = nil,
        safetyProfile: SafetyProfile = SafetyProfile(),
        verificationStatus: VerificationStatus = VerificationStatus(),
        reviews: [Review] = [],
        incidents: [IncidentReport] = [],
        googlePlaceId: String? = nil,
        tripAdvisorId: String? = nil
    ) {
        self.id = id
        self.name = name
        self.address = address
        self.city = city
        self.country = country
        self.latitude = latitude
        self.longitude = longitude
        self.phoneNumber = phoneNumber
        self.website = website
        self.cuisineTypes = cuisineTypes
        self.priceLevel = priceLevel
        self.photoURLs = photoURLs
        self.openingHours = openingHours
        self.googleRating = googleRating
        self.googleRatingCount = googleRatingCount
        self.isOpenNow = isOpenNow
        self.openingHoursText = openingHoursText
        self.safetyProfile = safetyProfile
        self.verificationStatus = verificationStatus
        self.reviews = reviews
        self.incidents = incidents
        self.googlePlaceId = googlePlaceId
        self.tripAdvisorId = tripAdvisorId
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    // MARK: - Score Calculations

    private func calculateCommunityScore() -> Int {
        guard !reviews.isEmpty else { return 0 }

        let safeReviews = reviews.filter { !$0.hadReaction }
        let safetyRatio = Double(safeReviews.count) / Double(reviews.count)

        // Weight by verified reviewers
        let verifiedWeight = reviews.filter { $0.isVerifiedReviewer }.count > 0 ? 1.2 : 1.0

        // Penalty for incidents
        let recentIncidents = incidents.filter {
            $0.reportedAt > Calendar.current.date(byAdding: .month, value: -6, to: Date())!
        }
        let incidentPenalty = Double(recentIncidents.count) * 5.0

        let baseScore = safetyRatio * 35.0 * verifiedWeight
        return max(0, min(35, Int(baseScore - incidentPenalty)))
    }

    private func calculateFreshnessScore() -> Int {
        let lastActivity = [
            verificationStatus.lastVerifiedAt,
            reviews.map(\.createdAt).max(),
            lastCheckIn
        ].compactMap { $0 }.max() ?? createdAt

        let daysSinceActivity = Calendar.current.dateComponents([.day], from: lastActivity, to: Date()).day ?? 365

        switch daysSinceActivity {
        case 0...7: return 25
        case 8...30: return 20
        case 31...90: return 15
        case 91...180: return 10
        case 181...365: return 5
        default: return 0
        }
    }
}

// MARK: - Price Level

enum PriceLevel: Int, Codable {
    case budget = 1      // £
    case moderate = 2    // ££
    case expensive = 3   // £££
    case luxury = 4      // ££££

    var symbol: String {
        String(repeating: "£", count: rawValue)
    }
}

// MARK: - Day Hours

struct DayHours: Codable, Equatable {
    let dayOfWeek: Int // 0 = Sunday, 6 = Saturday
    let openTime: String // "09:00"
    let closeTime: String // "22:00"
    let isClosed: Bool

    var dayName: String {
        let formatter = DateFormatter()
        return formatter.weekdaySymbols[dayOfWeek]
    }
}

// MARK: - Safety Profile

struct SafetyProfile: Codable, Equatable {
    /// Restaurant has a dedicated gluten-free kitchen or prep area
    var hasDedicatedKitchen: Bool = false

    /// Restaurant uses a separate fryer for gluten-free items
    var hasSeparateFryer: Bool = false

    /// Staff have received allergen/gluten-free training
    var hasTrainedStaff: Bool = false

    /// Type of staff training certification
    var staffTrainingType: StaffTrainingType?

    /// Restaurant has documented cross-contamination protocols
    var hasCrossContaminationProtocols: Bool = false

    /// Description of cross-contamination prevention measures
    var protocolDescription: String?

    /// Restaurant has official gluten-free certification
    var certifications: [GlutenFreeCertification] = []

    /// Restaurant offers a dedicated gluten-free menu
    var hasDedicatedMenu: Bool = false

    /// Additional notes from verification
    var notes: String?

    // MARK: - Computed Properties

    /// Whether this restaurant is considered safe for strict coeliacs
    var isCeliacSafe: Bool {
        hasDedicatedKitchen ||
        certifications.contains(.coeliacUK) ||
        certifications.contains(.aic) ||
        certifications.contains(.gfco)
    }

    /// Staff training level description for display
    var staffTrainingLevel: String? {
        guard hasTrainedStaff else { return nil }
        return staffTrainingType?.displayName ?? "Staff trained"
    }

    /// Primary certification for display
    var certification: GlutenFreeCertification? {
        certifications.first
    }
}

enum StaffTrainingType: String, Codable, CaseIterable {
    case allerTrain = "AllerTrain"
    case servSafeAllergens = "ServSafe Allergens"
    case coeliacUK = "Coeliac UK Accredited"
    case inHouse = "In-House Training"
    case unknown = "Unknown"

    var displayName: String { rawValue }
}

enum GlutenFreeCertification: String, Codable, CaseIterable {
    case coeliacUK = "Coeliac UK Accredited"
    case aic = "AIC (Italian Coeliac Association)"
    case dzg = "DZG (German Coeliac Society)"
    case gfco = "GFCO Certified"
    case gffp = "Gluten-Free Food Program"

    var displayName: String { rawValue }
}

// MARK: - Verification Status

struct VerificationStatus: Codable, Equatable {
    /// Professional verification score (0-40)
    var professionalScore: Int = 0

    /// Method used for verification
    var verificationMethod: VerificationMethod = .unverified

    /// Who performed the verification
    var verifiedBy: String?

    /// Date of last verification
    var lastVerifiedAt: Date?

    /// Has the restaurant owner/manager responded to our questionnaire
    var hasOwnerResponse: Bool = false

    /// Date owner/manager responded
    var ownerResponseDate: Date?

    /// Notes from verification process
    var verificationNotes: String?
}

enum VerificationMethod: String, Codable {
    case unverified = "Unverified"
    case communityVerified = "Community Verified"
    case ownerVerified = "Owner/Manager Verified"
    case dietitianVerified = "Dietitian Verified"
    case certificationVerified = "Certification Verified"

    var displayName: String { rawValue }

    var badgeColor: String {
        switch self {
        case .unverified: return "gray"
        case .communityVerified: return "yellow"
        case .ownerVerified: return "blue"
        case .dietitianVerified: return "green"
        case .certificationVerified: return "green"
        }
    }
}

// MARK: - Extensions

extension Restaurant {
    /// Overall trust level based on score
    var trustLevel: TrustLevel {
        trustScore.level
    }

    /// Whether this restaurant is considered safe for strict coeliacs
    var isCeliacSafe: Bool {
        safetyProfile.isCeliacSafe || trustScore.total >= 80
    }

    /// Recent safe dining experiences
    var recentSafeExperiences: Int {
        reviews.filter {
            !$0.hadReaction &&
            $0.createdAt > Calendar.current.date(byAdding: .month, value: -3, to: Date())!
        }.count
    }

    /// Preview data for SwiftUI previews
    static var preview: Restaurant {
        Restaurant(
            id: "preview-1",
            name: "The Gluten Free Kitchen",
            address: "123 High Street, London SW1A 1AA",
            city: "London",
            country: "United Kingdom",
            latitude: 51.5074,
            longitude: -0.1278,
            phoneNumber: "+44 20 7123 4567",
            website: "https://glutenfreekitchen.co.uk",
            cuisineTypes: ["British", "Bakery"],
            priceLevel: .moderate,
            photoURLs: [],
            openingHours: nil,
            googleRating: 4.5,
            googleRatingCount: 234,
            isOpenNow: true,
            openingHoursText: [
                "Monday: 9:00 AM - 10:00 PM",
                "Tuesday: 9:00 AM - 10:00 PM",
                "Wednesday: 9:00 AM - 10:00 PM",
                "Thursday: 9:00 AM - 10:00 PM",
                "Friday: 9:00 AM - 11:00 PM",
                "Saturday: 10:00 AM - 11:00 PM",
                "Sunday: 10:00 AM - 9:00 PM"
            ],
            safetyProfile: SafetyProfile(
                hasDedicatedKitchen: true,
                hasSeparateFryer: true,
                hasTrainedStaff: true,
                staffTrainingType: .coeliacUK,
                hasCrossContaminationProtocols: true,
                protocolDescription: "Full gluten-free kitchen with dedicated prep areas",
                certifications: [.coeliacUK],
                hasDedicatedMenu: true
            ),
            verificationStatus: VerificationStatus(
                professionalScore: 35,
                verificationMethod: .dietitianVerified,
                verifiedBy: "Sarah Jones, RD",
                lastVerifiedAt: Calendar.current.date(byAdding: .month, value: -2, to: Date()),
                hasOwnerResponse: true,
                ownerResponseDate: Calendar.current.date(byAdding: .month, value: -1, to: Date())
            ),
            googlePlaceId: "ChIJdd4hrwug2EcRmSrV3Vo6llI"
        )
    }
}
