import Foundation
import ComposableArchitecture
import CoreLocation

/// Search feature for finding gluten-free restaurants
@Reducer
struct SearchFeature {
    @ObservableState
    struct State: Equatable {
        var searchQuery: String = ""
        var searchResults: IdentifiedArrayOf<RestaurantAnnotation> = []
        var recentSearches: [String] = []
        var isSearching: Bool = false
        var errorMessage: String?

        // Filters
        var selectedCuisine: CuisineType?
        var selectedPriceRange: Set<PriceLevel> = []
        var onlyVerified: Bool = false
        var onlyCeliacSafe: Bool = false

        // Location for distance calculation
        var userLocation: CLLocationCoordinate2D?
    }

    enum Action: Equatable {
        case searchQueryChanged(String)
        case performSearch
        case searchResultsReceived([RestaurantAnnotation])
        case searchFailed(String)
        case clearSearch

        case cuisineSelected(CuisineType?)
        case priceRangeToggled(PriceLevel)
        case onlyVerifiedToggled
        case onlyCeliacSafeToggled
        case clearFilters

        case recentSearchTapped(String)
        case clearRecentSearches

        case restaurantTapped(RestaurantAnnotation)
        case userLocationUpdated(CLLocationCoordinate2D)
    }

    @Dependency(\.restaurantClient) var restaurantClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .searchQueryChanged(let query):
                state.searchQuery = query
                return .none

            case .performSearch:
                guard !state.searchQuery.isEmpty else {
                    state.searchResults = []
                    return .none
                }

                state.isSearching = true
                state.errorMessage = nil

                let query = state.searchQuery
                let location = state.userLocation ?? CLLocationCoordinate2D(latitude: 51.5074, longitude: -0.1278) // London default

                // Save to recent searches
                if !state.recentSearches.contains(query) {
                    state.recentSearches.insert(query, at: 0)
                    if state.recentSearches.count > 10 {
                        state.recentSearches.removeLast()
                    }
                }

                return .run { send in
                    do {
                        let results = try await restaurantClient.search(query, location)
                        await send(.searchResultsReceived(results))
                    } catch {
                        await send(.searchFailed(error.localizedDescription))
                    }
                }

            case .searchResultsReceived(let results):
                state.isSearching = false
                state.searchResults = IdentifiedArrayOf(uniqueElements: applyFilters(results, state: state))
                return .none

            case .searchFailed(let message):
                state.isSearching = false
                state.errorMessage = message
                return .none

            case .clearSearch:
                state.searchQuery = ""
                state.searchResults = []
                return .none

            case .cuisineSelected(let cuisine):
                state.selectedCuisine = cuisine
                return .none

            case .priceRangeToggled(let price):
                if state.selectedPriceRange.contains(price) {
                    state.selectedPriceRange.remove(price)
                } else {
                    state.selectedPriceRange.insert(price)
                }
                return .none

            case .onlyVerifiedToggled:
                state.onlyVerified.toggle()
                return .none

            case .onlyCeliacSafeToggled:
                state.onlyCeliacSafe.toggle()
                return .none

            case .clearFilters:
                state.selectedCuisine = nil
                state.selectedPriceRange = []
                state.onlyVerified = false
                state.onlyCeliacSafe = false
                return .none

            case .recentSearchTapped(let query):
                state.searchQuery = query
                return .send(.performSearch)

            case .clearRecentSearches:
                state.recentSearches = []
                return .none

            case .restaurantTapped:
                // Handle navigation to detail
                return .none

            case .userLocationUpdated(let location):
                state.userLocation = location
                return .none
            }
        }
    }

    private func applyFilters(_ results: [RestaurantAnnotation], state: State) -> [RestaurantAnnotation] {
        var filtered = results

        if let cuisine = state.selectedCuisine {
            filtered = filtered.filter { $0.cuisineType.lowercased() == cuisine.rawValue.lowercased() }
        }

        if !state.selectedPriceRange.isEmpty {
            filtered = filtered.filter { state.selectedPriceRange.contains($0.priceLevel) }
        }

        if state.onlyVerified {
            filtered = filtered.filter { $0.trustScore.total >= 60 }
        }

        if state.onlyCeliacSafe {
            filtered = filtered.filter { $0.isCeliacSafe }
        }

        return filtered
    }
}

// MARK: - Cuisine Types

enum CuisineType: String, CaseIterable {
    case italian = "Italian"
    case british = "British"
    case french = "French"
    case spanish = "Spanish"
    case german = "German"
    case indian = "Indian"
    case chinese = "Chinese"
    case japanese = "Japanese"
    case thai = "Thai"
    case mexican = "Mexican"
    case american = "American"
    case mediterranean = "Mediterranean"
    case bakery = "Bakery"
    case cafe = "Café"
    case pizza = "Pizza"
    case burger = "Burger"
    case seafood = "Seafood"
    case vegetarian = "Vegetarian"
    case vegan = "Vegan"

    var icon: String {
        switch self {
        case .italian, .pizza: return "🍝"
        case .british: return "🇬🇧"
        case .french: return "🥐"
        case .spanish: return "🥘"
        case .german: return "🥨"
        case .indian: return "🍛"
        case .chinese: return "🥡"
        case .japanese: return "🍱"
        case .thai: return "🍜"
        case .mexican: return "🌮"
        case .american, .burger: return "🍔"
        case .mediterranean: return "🫒"
        case .bakery: return "🥖"
        case .cafe: return "☕"
        case .seafood: return "🦐"
        case .vegetarian, .vegan: return "🥗"
        }
    }
}
