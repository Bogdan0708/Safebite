import Foundation
import SwiftData
import SwiftUI

/// SwiftData model container and persistence service for SafeBite
@MainActor
final class PersistenceService {
    static let shared = PersistenceService()

    let container: ModelContainer
    let context: ModelContext

    private init() {
        let schema = Schema([
            Restaurant.self,
            Review.self,
            User.self,
            IncidentReport.self,
            SavedRestaurantEntity.self,
            CachedRestaurant.self
        ])

        let modelConfiguration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )

        do {
            container = try ModelContainer(for: schema, configurations: [modelConfiguration])
            context = container.mainContext
            context.autosaveEnabled = true
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    // MARK: - Restaurant Operations

    func fetchRestaurant(byId id: String) -> Restaurant? {
        let descriptor = FetchDescriptor<Restaurant>(
            predicate: #Predicate { $0.id == id }
        )
        return try? context.fetch(descriptor).first
    }

    func fetchRestaurant(byGooglePlaceId placeId: String) -> Restaurant? {
        let descriptor = FetchDescriptor<Restaurant>(
            predicate: #Predicate { $0.googlePlaceId == placeId }
        )
        return try? context.fetch(descriptor).first
    }

    func saveRestaurant(_ restaurant: Restaurant) {
        context.insert(restaurant)
        try? context.save()
    }

    func deleteRestaurant(_ restaurant: Restaurant) {
        context.delete(restaurant)
        try? context.save()
    }

    // MARK: - Saved Restaurants

    func fetchSavedRestaurants() -> [SavedRestaurantEntity] {
        let descriptor = FetchDescriptor<SavedRestaurantEntity>(
            sortBy: [SortDescriptor(\.savedAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func saveRestaurantToFavorites(_ entity: SavedRestaurantEntity) {
        context.insert(entity)
        try? context.save()
    }

    func removeSavedRestaurant(byId id: String) {
        let descriptor = FetchDescriptor<SavedRestaurantEntity>(
            predicate: #Predicate { $0.id == id }
        )
        if let entity = try? context.fetch(descriptor).first {
            context.delete(entity)
            try? context.save()
        }
    }

    func isSaved(restaurantId: String) -> Bool {
        let descriptor = FetchDescriptor<SavedRestaurantEntity>(
            predicate: #Predicate { $0.id == restaurantId }
        )
        return (try? context.fetchCount(descriptor)) ?? 0 > 0
    }

    func updateSavedRestaurant(_ entity: SavedRestaurantEntity) {
        try? context.save()
    }

    // MARK: - Reviews

    func fetchReviews(forRestaurantId restaurantId: String) -> [Review] {
        let descriptor = FetchDescriptor<Review>(
            predicate: #Predicate { $0.restaurant?.id == restaurantId },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func saveReview(_ review: Review) {
        context.insert(review)
        try? context.save()
    }

    // MARK: - User

    func fetchCurrentUser() -> User? {
        let descriptor = FetchDescriptor<User>(
            sortBy: [SortDescriptor(\.lastActiveAt, order: .reverse)]
        )
        return try? context.fetch(descriptor).first
    }

    func saveUser(_ user: User) {
        context.insert(user)
        try? context.save()
    }

    func deleteUser(_ user: User) {
        context.delete(user)
        try? context.save()
    }

    // MARK: - Cache Operations

    func cacheRestaurant(_ cached: CachedRestaurant) {
        // Remove old cache for same ID
        let descriptor = FetchDescriptor<CachedRestaurant>(
            predicate: #Predicate { $0.googlePlaceId == cached.googlePlaceId }
        )
        if let existing = try? context.fetch(descriptor).first {
            context.delete(existing)
        }

        context.insert(cached)
        try? context.save()
    }

    func getCachedRestaurant(googlePlaceId: String) -> CachedRestaurant? {
        let descriptor = FetchDescriptor<CachedRestaurant>(
            predicate: #Predicate { $0.googlePlaceId == googlePlaceId }
        )
        guard let cached = try? context.fetch(descriptor).first else { return nil }

        // Check if cache is still valid (24 hours)
        if Date().timeIntervalSince(cached.cachedAt) > 24 * 60 * 60 {
            context.delete(cached)
            try? context.save()
            return nil
        }

        return cached
    }

    func clearExpiredCache() {
        let expirationDate = Date().addingTimeInterval(-24 * 60 * 60)
        let descriptor = FetchDescriptor<CachedRestaurant>(
            predicate: #Predicate { $0.cachedAt < expirationDate }
        )

        if let expired = try? context.fetch(descriptor) {
            for item in expired {
                context.delete(item)
            }
            try? context.save()
        }
    }

    // MARK: - Bulk Operations

    func deleteAllData() {
        // Delete all entities - for GDPR compliance
        do {
            try context.delete(model: Restaurant.self)
            try context.delete(model: Review.self)
            try context.delete(model: User.self)
            try context.delete(model: IncidentReport.self)
            try context.delete(model: SavedRestaurantEntity.self)
            try context.delete(model: CachedRestaurant.self)
            try context.save()
        } catch {
            print("Failed to delete all data: \(error)")
        }
    }

    // MARK: - Export

    func exportUserData() -> UserDataExport? {
        guard let user = fetchCurrentUser() else { return nil }

        let savedRestaurants = fetchSavedRestaurants()

        // Fetch user's reviews
        let reviewDescriptor = FetchDescriptor<Review>(
            predicate: #Predicate { $0.userId == user.id }
        )
        let reviews = (try? context.fetch(reviewDescriptor)) ?? []

        return UserDataExport(
            user: user,
            savedRestaurants: savedRestaurants,
            reviews: reviews,
            exportedAt: Date()
        )
    }
}

// MARK: - Saved Restaurant Entity (SwiftData)

@Model
final class SavedRestaurantEntity {
    @Attribute(.unique) var id: String
    var googlePlaceId: String?
    var name: String
    var address: String
    var city: String
    var cuisineType: String
    var priceLevelRaw: Int
    var latitude: Double
    var longitude: Double

    // SafeBite data
    var trustScore: Int
    var isCeliacSafe: Bool
    var hasDedicatedKitchen: Bool
    var hasSeparateFryer: Bool

    // User data
    var savedAt: Date
    var hasVisited: Bool
    var lastVisitedAt: Date?
    var notes: String?

    var priceLevel: PriceLevel {
        PriceLevel(rawValue: priceLevelRaw) ?? .moderate
    }

    init(
        id: String = UUID().uuidString,
        googlePlaceId: String? = nil,
        name: String,
        address: String,
        city: String,
        cuisineType: String,
        priceLevel: PriceLevel = .moderate,
        latitude: Double,
        longitude: Double,
        trustScore: Int = 0,
        isCeliacSafe: Bool = false,
        hasDedicatedKitchen: Bool = false,
        hasSeparateFryer: Bool = false,
        savedAt: Date = Date(),
        hasVisited: Bool = false,
        lastVisitedAt: Date? = nil,
        notes: String? = nil
    ) {
        self.id = id
        self.googlePlaceId = googlePlaceId
        self.name = name
        self.address = address
        self.city = city
        self.cuisineType = cuisineType
        self.priceLevelRaw = priceLevel.rawValue
        self.latitude = latitude
        self.longitude = longitude
        self.trustScore = trustScore
        self.isCeliacSafe = isCeliacSafe
        self.hasDedicatedKitchen = hasDedicatedKitchen
        self.hasSeparateFryer = hasSeparateFryer
        self.savedAt = savedAt
        self.hasVisited = hasVisited
        self.lastVisitedAt = lastVisitedAt
        self.notes = notes
    }

    /// Convert to the Codable SavedRestaurant model
    func toSavedRestaurant() -> SavedRestaurant {
        SavedRestaurant(
            id: id,
            googlePlaceId: googlePlaceId,
            name: name,
            address: address,
            city: city,
            cuisineType: cuisineType,
            priceLevel: priceLevel,
            latitude: latitude,
            longitude: longitude,
            trustScore: trustScore,
            isCeliacSafe: isCeliacSafe,
            hasDedicatedKitchen: hasDedicatedKitchen,
            hasSeparateFryer: hasSeparateFryer,
            savedAt: savedAt,
            hasVisited: hasVisited,
            lastVisitedAt: lastVisitedAt,
            notes: notes
        )
    }

    /// Create from SavedRestaurant model
    convenience init(from model: SavedRestaurant) {
        self.init(
            id: model.id,
            googlePlaceId: model.googlePlaceId,
            name: model.name,
            address: model.address,
            city: model.city,
            cuisineType: model.cuisineType,
            priceLevel: model.priceLevel,
            latitude: model.latitude,
            longitude: model.longitude,
            trustScore: model.trustScore,
            isCeliacSafe: model.isCeliacSafe,
            hasDedicatedKitchen: model.hasDedicatedKitchen,
            hasSeparateFryer: model.hasSeparateFryer,
            savedAt: model.savedAt,
            hasVisited: model.hasVisited,
            lastVisitedAt: model.lastVisitedAt,
            notes: model.notes
        )
    }
}

// MARK: - Cached Restaurant (for Google Places data)

@Model
final class CachedRestaurant {
    @Attribute(.unique) var googlePlaceId: String
    var name: String
    var address: String
    var latitude: Double
    var longitude: Double
    var cuisineTypes: [String]
    var priceLevelRaw: Int
    var rating: Double?
    var ratingCount: Int?
    var isOpenNow: Bool?
    var openingHoursText: [String]?
    var phoneNumber: String?
    var website: String?
    var photoReferences: [String]

    var cachedAt: Date

    var priceLevel: PriceLevel {
        PriceLevel(rawValue: priceLevelRaw) ?? .moderate
    }

    init(
        googlePlaceId: String,
        name: String,
        address: String,
        latitude: Double,
        longitude: Double,
        cuisineTypes: [String] = [],
        priceLevel: PriceLevel = .moderate,
        rating: Double? = nil,
        ratingCount: Int? = nil,
        isOpenNow: Bool? = nil,
        openingHoursText: [String]? = nil,
        phoneNumber: String? = nil,
        website: String? = nil,
        photoReferences: [String] = []
    ) {
        self.googlePlaceId = googlePlaceId
        self.name = name
        self.address = address
        self.latitude = latitude
        self.longitude = longitude
        self.cuisineTypes = cuisineTypes
        self.priceLevelRaw = priceLevel.rawValue
        self.rating = rating
        self.ratingCount = ratingCount
        self.isOpenNow = isOpenNow
        self.openingHoursText = openingHoursText
        self.phoneNumber = phoneNumber
        self.website = website
        self.photoReferences = photoReferences
        self.cachedAt = Date()
    }

    /// Create from GooglePlace response
    convenience init(from place: GooglePlace) {
        let priceLevel: PriceLevel
        switch place.priceLevel {
        case "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE":
            priceLevel = .budget
        case "PRICE_LEVEL_MODERATE":
            priceLevel = .moderate
        case "PRICE_LEVEL_EXPENSIVE":
            priceLevel = .expensive
        case "PRICE_LEVEL_VERY_EXPENSIVE":
            priceLevel = .luxury
        default:
            priceLevel = .moderate
        }

        self.init(
            googlePlaceId: place.id,
            name: place.displayName?.text ?? "Unknown",
            address: place.formattedAddress ?? "",
            latitude: place.location?.latitude ?? 0,
            longitude: place.location?.longitude ?? 0,
            cuisineTypes: place.types ?? [],
            priceLevel: priceLevel,
            rating: place.rating,
            ratingCount: place.userRatingCount,
            isOpenNow: place.regularOpeningHours?.openNow,
            openingHoursText: place.regularOpeningHours?.weekdayDescriptions,
            phoneNumber: place.nationalPhoneNumber,
            website: place.websiteUri,
            photoReferences: place.photos?.map { $0.name } ?? []
        )
    }
}

// MARK: - User Data Export (for GDPR)

struct UserDataExport: Codable {
    let userId: String
    let email: String
    let displayName: String
    let severityLevel: String
    let savedRestaurants: [SavedRestaurantExport]
    let reviews: [ReviewExport]
    let exportedAt: Date

    init(user: User, savedRestaurants: [SavedRestaurantEntity], reviews: [Review], exportedAt: Date) {
        self.userId = user.id
        self.email = user.email
        self.displayName = user.displayName
        self.severityLevel = user.severityLevel.rawValue
        self.savedRestaurants = savedRestaurants.map { SavedRestaurantExport(from: $0) }
        self.reviews = reviews.map { ReviewExport(from: $0) }
        self.exportedAt = exportedAt
    }

    struct SavedRestaurantExport: Codable {
        let id: String
        let name: String
        let address: String
        let city: String
        let savedAt: Date
        let hasVisited: Bool
        let notes: String?

        init(from entity: SavedRestaurantEntity) {
            self.id = entity.id
            self.name = entity.name
            self.address = entity.address
            self.city = entity.city
            self.savedAt = entity.savedAt
            self.hasVisited = entity.hasVisited
            self.notes = entity.notes
        }
    }

    struct ReviewExport: Codable {
        let id: String
        let restaurantName: String
        let content: String
        let safetyRating: Int
        let foodRating: Int
        let hadReaction: Bool
        let createdAt: Date

        init(from review: Review) {
            self.id = review.id
            self.restaurantName = review.restaurant?.name ?? "Unknown"
            self.content = review.content
            self.safetyRating = review.safetyRating
            self.foodRating = review.rating
            self.hadReaction = review.hadReaction
            self.createdAt = review.createdAt
        }
    }

    func toJSON() -> Data? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try? encoder.encode(self)
    }
}

// MARK: - SwiftData Container Extension for SwiftUI

extension View {
    func withPersistence() -> some View {
        self.modelContainer(PersistenceService.shared.container)
    }
}
