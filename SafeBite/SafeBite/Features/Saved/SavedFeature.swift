import Foundation
import ComposableArchitecture
import SwiftData

/// Feature for managing saved/favorite restaurants
@Reducer
struct SavedFeature {
    @ObservableState
    struct State: Equatable {
        var savedRestaurants: IdentifiedArrayOf<SavedRestaurant> = []
        var isLoading: Bool = false
        var errorMessage: String?
        var selectedRestaurant: SavedRestaurant?
        var showRestaurantDetail: Bool = false
        var sortOption: SortOption = .dateAdded
        var filterOption: FilterOption = .all
    }

    enum SortOption: String, CaseIterable, Equatable {
        case dateAdded = "Date Added"
        case name = "Name"
        case trustScore = "Trust Score"
        case distance = "Distance"

        var icon: String {
            switch self {
            case .dateAdded: return "calendar"
            case .name: return "textformat.abc"
            case .trustScore: return "checkmark.shield"
            case .distance: return "location"
            }
        }
    }

    enum FilterOption: String, CaseIterable, Equatable {
        case all = "All"
        case celiacSafe = "Celiac Safe"
        case verified = "Verified"
        case visited = "Visited"

        var icon: String {
            switch self {
            case .all: return "square.grid.2x2"
            case .celiacSafe: return "checkmark.shield.fill"
            case .verified: return "checkmark.seal.fill"
            case .visited: return "checkmark.circle.fill"
            }
        }
    }

    enum Action: Equatable {
        case onAppear
        case loadSavedRestaurants
        case savedRestaurantsLoaded([SavedRestaurant])
        case loadFailed(String)

        case restaurantTapped(SavedRestaurant)
        case dismissRestaurantDetail
        case removeRestaurant(SavedRestaurant.ID)
        case removeConfirmed(SavedRestaurant.ID)
        case markAsVisited(SavedRestaurant.ID)

        case sortOptionChanged(SortOption)
        case filterOptionChanged(FilterOption)

        case syncWithCloud
        case syncCompleted
    }

    @Dependency(\.savedRestaurantClient) var savedClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                return .send(.loadSavedRestaurants)

            case .loadSavedRestaurants:
                state.isLoading = true
                state.errorMessage = nil

                return .run { send in
                    do {
                        let restaurants = try await savedClient.fetchAll()
                        await send(.savedRestaurantsLoaded(restaurants))
                    } catch {
                        await send(.loadFailed(error.localizedDescription))
                    }
                }

            case .savedRestaurantsLoaded(let restaurants):
                state.isLoading = false
                state.savedRestaurants = IdentifiedArrayOf(uniqueElements: sortAndFilter(
                    restaurants,
                    sort: state.sortOption,
                    filter: state.filterOption
                ))
                return .none

            case .loadFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .restaurantTapped(let restaurant):
                state.selectedRestaurant = restaurant
                state.showRestaurantDetail = true
                return .none

            case .dismissRestaurantDetail:
                state.showRestaurantDetail = false
                state.selectedRestaurant = nil
                return .none

            case .removeRestaurant:
                // Show confirmation - handled by view
                return .none

            case .removeConfirmed(let id):
                state.savedRestaurants.remove(id: id)

                return .run { _ in
                    try await savedClient.remove(id)
                }

            case .markAsVisited(let id):
                if var restaurant = state.savedRestaurants[id: id] {
                    restaurant.hasVisited = true
                    restaurant.lastVisitedAt = Date()
                    state.savedRestaurants[id: id] = restaurant

                    return .run { _ in
                        try await savedClient.update(restaurant)
                    }
                }
                return .none

            case .sortOptionChanged(let option):
                state.sortOption = option
                state.savedRestaurants = IdentifiedArrayOf(uniqueElements: sortAndFilter(
                    Array(state.savedRestaurants),
                    sort: option,
                    filter: state.filterOption
                ))
                return .none

            case .filterOptionChanged(let option):
                state.filterOption = option
                return .send(.loadSavedRestaurants)

            case .syncWithCloud:
                return .run { send in
                    try await savedClient.syncWithCloud()
                    await send(.syncCompleted)
                }

            case .syncCompleted:
                return .send(.loadSavedRestaurants)
            }
        }
    }

    // MARK: - Private Helpers

    private func sortAndFilter(
        _ restaurants: [SavedRestaurant],
        sort: SortOption,
        filter: FilterOption
    ) -> [SavedRestaurant] {
        var filtered = restaurants

        // Apply filter
        switch filter {
        case .all:
            break
        case .celiacSafe:
            filtered = filtered.filter { $0.isCeliacSafe }
        case .verified:
            filtered = filtered.filter { $0.trustScore >= 60 }
        case .visited:
            filtered = filtered.filter { $0.hasVisited }
        }

        // Apply sort
        switch sort {
        case .dateAdded:
            filtered.sort { $0.savedAt > $1.savedAt }
        case .name:
            filtered.sort { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .trustScore:
            filtered.sort { $0.trustScore > $1.trustScore }
        case .distance:
            filtered.sort { ($0.distanceFromUser ?? .infinity) < ($1.distanceFromUser ?? .infinity) }
        }

        return filtered
    }
}

// MARK: - Saved Restaurant Model

struct SavedRestaurant: Identifiable, Equatable, Codable {
    let id: String
    let googlePlaceId: String?
    let name: String
    let address: String
    let city: String
    let cuisineType: String
    let priceLevel: PriceLevel
    let latitude: Double
    let longitude: Double

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

    // Computed at runtime
    var distanceFromUser: Double?

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
        self.priceLevel = priceLevel
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

    /// Create from a Restaurant model
    init(from restaurant: Restaurant) {
        self.id = restaurant.id
        self.googlePlaceId = restaurant.googlePlaceId
        self.name = restaurant.name
        self.address = restaurant.address
        self.city = restaurant.city
        self.cuisineType = restaurant.cuisineType
        self.priceLevel = restaurant.priceLevel
        self.latitude = restaurant.latitude
        self.longitude = restaurant.longitude
        self.trustScore = restaurant.trustScore.total
        self.isCeliacSafe = restaurant.isCeliacSafe
        self.hasDedicatedKitchen = restaurant.safetyProfile.hasDedicatedKitchen
        self.hasSeparateFryer = restaurant.safetyProfile.hasSeparateFryer
        self.savedAt = Date()
        self.hasVisited = false
    }

    /// Create from RestaurantAnnotation
    init(from annotation: RestaurantAnnotation) {
        self.id = annotation.id
        self.googlePlaceId = annotation.id
        self.name = annotation.name
        self.address = ""
        self.city = ""
        self.cuisineType = annotation.cuisineType
        self.priceLevel = annotation.priceLevel
        self.latitude = annotation.coordinate.latitude
        self.longitude = annotation.coordinate.longitude
        self.trustScore = annotation.trustScore.total
        self.isCeliacSafe = annotation.isCeliacSafe
        self.hasDedicatedKitchen = false
        self.hasSeparateFryer = false
        self.savedAt = Date()
        self.hasVisited = false
    }
}

// MARK: - Saved Restaurant Client

struct SavedRestaurantClient {
    var fetchAll: @Sendable () async throws -> [SavedRestaurant]
    var save: @Sendable (SavedRestaurant) async throws -> Void
    var update: @Sendable (SavedRestaurant) async throws -> Void
    var remove: @Sendable (String) async throws -> Void
    var isSaved: @Sendable (String) async -> Bool
    var syncWithCloud: @Sendable () async throws -> Void
}

extension SavedRestaurantClient: DependencyKey {
    static let liveValue = SavedRestaurantClient(
        fetchAll: {
            await MainActor.run {
                let entities = PersistenceService.shared.fetchSavedRestaurants()
                return entities.map { $0.toSavedRestaurant() }
            }
        },
        save: { restaurant in
            await MainActor.run {
                let entity = SavedRestaurantEntity(from: restaurant)
                PersistenceService.shared.saveRestaurantToFavorites(entity)
            }
        },
        update: { restaurant in
            await MainActor.run {
                // Fetch existing entity and update
                let entities = PersistenceService.shared.fetchSavedRestaurants()
                if let entity = entities.first(where: { $0.id == restaurant.id }) {
                    entity.hasVisited = restaurant.hasVisited
                    entity.lastVisitedAt = restaurant.lastVisitedAt
                    entity.notes = restaurant.notes
                    entity.trustScore = restaurant.trustScore
                    PersistenceService.shared.updateSavedRestaurant(entity)
                }
            }
        },
        remove: { id in
            await MainActor.run {
                PersistenceService.shared.removeSavedRestaurant(byId: id)
            }
        },
        isSaved: { id in
            await MainActor.run {
                PersistenceService.shared.isSaved(restaurantId: id)
            }
        },
        syncWithCloud: {
            // TODO: Implement Firebase sync
            // This would:
            // 1. Fetch user's saved restaurants from Firebase
            // 2. Merge with local SwiftData
            // 3. Push local changes to Firebase
        }
    )

    static let testValue = SavedRestaurantClient(
        fetchAll: { mockSavedRestaurants },
        save: { _ in },
        update: { _ in },
        remove: { _ in },
        isSaved: { _ in false },
        syncWithCloud: { }
    )
}

extension DependencyValues {
    var savedRestaurantClient: SavedRestaurantClient {
        get { self[SavedRestaurantClient.self] }
        set { self[SavedRestaurantClient.self] = newValue }
    }
}

// MARK: - Mock Data

private let mockSavedRestaurants: [SavedRestaurant] = [
    SavedRestaurant(
        id: "saved-1",
        googlePlaceId: "ChIJ1",
        name: "The Gluten Free Bakery",
        address: "123 High Street",
        city: "London",
        cuisineType: "Bakery",
        priceLevel: .moderate,
        latitude: 51.5074,
        longitude: -0.1278,
        trustScore: 92,
        isCeliacSafe: true,
        hasDedicatedKitchen: true,
        hasSeparateFryer: true,
        savedAt: Date().addingTimeInterval(-86400 * 7),
        hasVisited: true,
        lastVisitedAt: Date().addingTimeInterval(-86400 * 2)
    ),
    SavedRestaurant(
        id: "saved-2",
        googlePlaceId: "ChIJ2",
        name: "Celiac Kitchen",
        address: "45 Queens Road",
        city: "London",
        cuisineType: "British",
        priceLevel: .expensive,
        latitude: 51.5094,
        longitude: -0.1300,
        trustScore: 78,
        isCeliacSafe: true,
        hasDedicatedKitchen: true,
        hasSeparateFryer: false,
        savedAt: Date().addingTimeInterval(-86400 * 14),
        hasVisited: false
    ),
    SavedRestaurant(
        id: "saved-3",
        googlePlaceId: "ChIJ3",
        name: "Pizza Express",
        address: "78 Market Street",
        city: "Manchester",
        cuisineType: "Italian",
        priceLevel: .moderate,
        latitude: 53.4808,
        longitude: -2.2426,
        trustScore: 58,
        isCeliacSafe: false,
        hasDedicatedKitchen: false,
        hasSeparateFryer: false,
        savedAt: Date().addingTimeInterval(-86400 * 30),
        hasVisited: true,
        lastVisitedAt: Date().addingTimeInterval(-86400 * 20)
    )
]
