import Foundation
import MapKit
import ComposableArchitecture

/// Map feature for discovering gluten-free restaurants
@Reducer
struct MapFeature {
    @ObservableState
    struct State: Equatable {
        // Map state
        var region: MKCoordinateRegion = .europe
        var cameraPosition: MapCameraPosition = .automatic

        // Restaurants
        var restaurants: IdentifiedArrayOf<RestaurantAnnotation> = []
        var selectedRestaurant: RestaurantAnnotation?

        // Filters
        var activeFilters: Set<FilterOption> = []
        var searchQuery: String = ""

        // UI State
        var isLoading: Bool = false
        var showFilters: Bool = false
        var showRestaurantDetail: Bool = false
        var errorMessage: String?

        // User location
        var userLocation: CLLocationCoordinate2D?
        var locationAuthorizationStatus: CLAuthorizationStatus = .notDetermined
    }

    enum Action: Equatable {
        // Map interactions
        case onMapAppear
        case regionChanged(MKCoordinateRegion)
        case annotationTapped(RestaurantAnnotation)
        case dismissRestaurantDetail

        // Search & Filter
        case searchQueryChanged(String)
        case performSearch(String) // Added
        case filterToggled(FilterOption)
        case clearFilters
        case toggleFiltersSheet

        // Location
        case requestLocationPermission
        case locationAuthorizationChanged(CLAuthorizationStatus)
        case userLocationUpdated(CLLocationCoordinate2D)
        case centerOnUserLocation

        // Data
        case fetchRestaurantsNearby
        case restaurantsReceived([RestaurantAnnotation])
        case fetchFailed(String)

        // Navigation
        case openDirections(RestaurantAnnotation)
    }

    @Dependency(\.restaurantClient) var restaurantClient
    @Dependency(\.locationClient) var locationClient

    private enum CancelID { case search }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onMapAppear:
                return .send(.requestLocationPermission)

            case .regionChanged(let region):
                state.region = region
                return .none

            case .annotationTapped(let restaurant):
                state.selectedRestaurant = restaurant
                state.showRestaurantDetail = true
                return .none

            case .dismissRestaurantDetail:
                state.showRestaurantDetail = false
                state.selectedRestaurant = nil
                return .none

            case .searchQueryChanged(let query):
                state.searchQuery = query
                if query.isEmpty {
                    return .send(.fetchRestaurantsNearby)
                }
                return .run { send in
                    try await Task.sleep(nanoseconds: 500 * 1_000_000)
                    await send(.performSearch(query))
                }
                .cancellable(id: CancelID.search, cancelInFlight: true)

            case .performSearch(let query):
                state.isLoading = true
                state.errorMessage = nil
                let center = state.userLocation ?? state.region.center
                
                return .run { send in
                    do {
                        let restaurants = try await restaurantClient.search(query, center)
                        await send(.restaurantsReceived(restaurants))
                    } catch {
                        await send(.fetchFailed(error.localizedDescription))
                    }
                }

            case .filterToggled(let filter):
                if state.activeFilters.contains(filter) {
                    state.activeFilters.remove(filter)
                } else {
                    state.activeFilters.insert(filter)
                }
                return .send(.fetchRestaurantsNearby)

            case .clearFilters:
                state.activeFilters.removeAll()
                return .send(.fetchRestaurantsNearby)

            case .toggleFiltersSheet:
                state.showFilters.toggle()
                return .none

            case .requestLocationPermission:
                return .run { send in
                    let status = await locationClient.requestAuthorization()
                    await send(.locationAuthorizationChanged(status))
                }

            case .locationAuthorizationChanged(let status):
                state.locationAuthorizationStatus = status
                if status == .authorizedWhenInUse || status == .authorizedAlways {
                    return .run { send in
                        for await location in locationClient.locationUpdates() {
                            await send(.userLocationUpdated(location))
                        }
                    }
                }
                return .none

            case .userLocationUpdated(let coordinate):
                state.userLocation = coordinate
                if state.restaurants.isEmpty {
                    return .send(.fetchRestaurantsNearby)
                }
                return .none

            case .centerOnUserLocation:
                guard let location = state.userLocation else { return .none }
                state.region = MKCoordinateRegion(
                    center: location,
                    span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
                )
                return .none

            case .fetchRestaurantsNearby:
                state.isLoading = true
                state.errorMessage = nil

                let center = state.userLocation ?? state.region.center
                let filters = state.activeFilters

                return .run { send in
                    do {
                        let restaurants = try await restaurantClient.fetchNearby(
                            latitude: center.latitude,
                            longitude: center.longitude,
                            filters: filters
                        )
                        await send(.restaurantsReceived(restaurants))
                    } catch {
                        await send(.fetchFailed(error.localizedDescription))
                    }
                }

            case .restaurantsReceived(let restaurants):
                state.isLoading = false
                state.restaurants = IdentifiedArrayOf(uniqueElements: restaurants)
                return .none

            case .fetchFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .openDirections(let restaurant):
                // Open in Apple Maps
                let mapItem = MKMapItem(
                    placemark: MKPlacemark(coordinate: restaurant.coordinate)
                )
                mapItem.name = restaurant.name
                mapItem.openInMaps(launchOptions: [
                    MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking
                ])
                return .none
            }
        }
    }
}

// MARK: - Restaurant Annotation

struct RestaurantAnnotation: Identifiable, Equatable {
    let id: String
    let name: String
    let coordinate: CLLocationCoordinate2D
    let trustScore: TrustScore
    let cuisineType: String
    let priceLevel: PriceLevel
    let isCeliacSafe: Bool
    let distance: Double? // in meters

    static func == (lhs: RestaurantAnnotation, rhs: RestaurantAnnotation) -> Bool {
        lhs.id == rhs.id
    }

    var pinColor: String {
        trustScore.level.color.description
    }
}

// MARK: - Filter Options

enum FilterOption: String, CaseIterable, Equatable, Hashable {
    case celiacSafe = "Celiac Safe"
    case verifiedOnly = "Verified Only"
    case dedicatedKitchen = "Dedicated Kitchen"
    case separateFryer = "Separate Fryer"
    case openNow = "Open Now"

    var icon: String {
        switch self {
        case .celiacSafe: return "shield.checkered"
        case .verifiedOnly: return "checkmark.seal.fill"
        case .dedicatedKitchen: return "fork.knife"
        case .separateFryer: return "frying.pan.fill"
        case .openNow: return "clock.fill"
        }
    }
}

// MARK: - Default Region (Europe)

extension MKCoordinateRegion {
    static let europe = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 48.8566, longitude: 2.3522), // Paris as default
        span: MKCoordinateSpan(latitudeDelta: 10, longitudeDelta: 10)
    )

    static let london = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 51.5074, longitude: -0.1278),
        span: MKCoordinateSpan(latitudeDelta: 0.1, longitudeDelta: 0.1)
    )
}

// MARK: - Dependencies

struct RestaurantClient {
    var fetchNearby: @Sendable (Double, Double, Set<FilterOption>) async throws -> [RestaurantAnnotation]
    var fetchDetails: @Sendable (String) async throws -> GooglePlace
    var search: @Sendable (String, CLLocationCoordinate2D) async throws -> [RestaurantAnnotation]
}

extension RestaurantClient: DependencyKey {
    // API Key from Config
    private static let apiKey = Config.googlePlacesAPIKey

    static let liveValue = RestaurantClient(
        fetchNearby: { lat, lng, filters in
            // Use mock data if no API key is configured
            guard !apiKey.isEmpty else {
                return applyFilters(mockRestaurants, filters: filters)
            }

            let service = GooglePlacesService(apiKey: apiKey)
            let userLocation = CLLocationCoordinate2D(latitude: lat, longitude: lng)

            // Fetch from Google Places
            let places = try await service.searchNearby(
                latitude: lat,
                longitude: lng,
                radius: 5000,
                types: ["restaurant", "bakery", "cafe"]
            )

            // Convert to our model and apply filters
            var annotations = places.compactMap { $0.toRestaurantAnnotation(userLocation: userLocation) }

            // Enrich with SafeBite data (from local cache/Firebase)
            annotations = await enrichWithSafeBiteData(annotations)

            return applyFilters(annotations, filters: filters)
        },
        fetchDetails: { id in
            guard !apiKey.isEmpty else {
                throw GooglePlacesError.apiError(message: "API key not configured")
            }

            let service = GooglePlacesService(apiKey: apiKey)
            return try await service.getPlaceDetails(placeId: id)
        },
        search: { query, location in
            // Use mock data if no API key is configured
            guard !apiKey.isEmpty else {
                return mockRestaurants.filter {
                    $0.name.localizedCaseInsensitiveContains(query) ||
                    $0.cuisineType.localizedCaseInsensitiveContains(query)
                }
            }

            let service = GooglePlacesService(apiKey: apiKey)

            let places = try await service.searchByText(
                query: query,
                latitude: location.latitude,
                longitude: location.longitude
            )

            var annotations = places.compactMap { $0.toRestaurantAnnotation(userLocation: location) }
            annotations = await enrichWithSafeBiteData(annotations)

            return annotations
        }
    )

    static let testValue = RestaurantClient(
        fetchNearby: { _, _, _ in mockRestaurants },
        fetchDetails: { _ in throw GooglePlacesError.apiError(message: "Test mode") },
        search: { _, _ in [] }
    )

    // MARK: - Helper Functions

    private static func applyFilters(_ restaurants: [RestaurantAnnotation], filters: Set<FilterOption>) -> [RestaurantAnnotation] {
        guard !filters.isEmpty else { return restaurants }

        return restaurants.filter { restaurant in
            for filter in filters {
                switch filter {
                case .celiacSafe:
                    if !restaurant.isCeliacSafe { return false }
                case .verifiedOnly:
                    if restaurant.trustScore.total < 60 { return false }
                case .dedicatedKitchen:
                    // This would check SafetyProfile - for now check trust score
                    if restaurant.trustScore.professionalScore < 20 { return false }
                case .separateFryer:
                    // This would check SafetyProfile - for now check trust score
                    if restaurant.trustScore.professionalScore < 15 { return false }
                case .openNow:
                    // Would need opening hours data - pass through for now
                    break
                }
            }
            return true
        }
    }

    private static func enrichWithSafeBiteData(_ annotations: [RestaurantAnnotation]) async -> [RestaurantAnnotation] {
        let ids = annotations.map { $0.id }
        
        do {
            // Fetch real trust data from Firestore
            let trustDataMap = try await FirestoreService.shared.fetchTrustData(for: ids)
            
            return annotations.map { annotation in
                if let data = trustDataMap[annotation.id] {
                    return RestaurantAnnotation(
                        id: annotation.id,
                        name: annotation.name,
                        coordinate: annotation.coordinate,
                        trustScore: TrustScore(
                            professionalScore: data.professionalScore,
                            communityScore: data.communityScore,
                            freshnessScore: data.freshnessScore
                        ),
                        cuisineType: annotation.cuisineType,
                        priceLevel: annotation.priceLevel,
                        // Determine if safe based on score
                        isCeliacSafe: data.totalScore >= 80,
                        distance: annotation.distance
                    )
                }
                return annotation
            }
        } catch {
            print("Failed to enrich restaurant data: \(error.localizedDescription)")
            return annotations
        }
    }
}

extension DependencyValues {
    var restaurantClient: RestaurantClient {
        get { self[RestaurantClient.self] }
        set { self[RestaurantClient.self] = newValue }
    }
}

struct LocationClient {
    var requestAuthorization: @Sendable () async -> CLAuthorizationStatus
    var locationUpdates: @Sendable () -> AsyncStream<CLLocationCoordinate2D>
    var currentLocation: @Sendable () async -> CLLocationCoordinate2D?
}

extension LocationClient: DependencyKey {
    static let liveValue = LocationClient(
        requestAuthorization: {
            await LocationManager.shared.requestAuthorization()
        },
        locationUpdates: {
            LocationManager.shared.locationStream()
        },
        currentLocation: {
            await LocationManager.shared.getCurrentLocation()
        }
    )

    static let testValue = LocationClient(
        requestAuthorization: { .authorizedWhenInUse },
        locationUpdates: {
            AsyncStream { continuation in
                continuation.yield(CLLocationCoordinate2D(latitude: 51.5074, longitude: -0.1278))
            }
        },
        currentLocation: {
            CLLocationCoordinate2D(latitude: 51.5074, longitude: -0.1278)
        }
    )
}

extension DependencyValues {
    var locationClient: LocationClient {
        get { self[LocationClient.self] }
        set { self[LocationClient.self] = newValue }
    }
}

// MARK: - Location Manager

/// Singleton wrapper around CLLocationManager for async/await support
final class LocationManager: NSObject, @unchecked Sendable {
    static let shared = LocationManager()

    private let manager = CLLocationManager()
    private var authorizationContinuation: CheckedContinuation<CLAuthorizationStatus, Never>?
    private var locationContinuations: [UUID: AsyncStream<CLLocationCoordinate2D>.Continuation] = [:]
    private let lock = NSLock()

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 100 // Update every 100 meters
    }

    func requestAuthorization() async -> CLAuthorizationStatus {
        let currentStatus = manager.authorizationStatus

        switch currentStatus {
        case .notDetermined:
            return await withCheckedContinuation { continuation in
                self.authorizationContinuation = continuation
                DispatchQueue.main.async {
                    self.manager.requestWhenInUseAuthorization()
                }
            }
        default:
            return currentStatus
        }
    }

    func locationStream() -> AsyncStream<CLLocationCoordinate2D> {
        AsyncStream { continuation in
            let id = UUID()

            lock.lock()
            locationContinuations[id] = continuation
            lock.unlock()

            continuation.onTermination = { [weak self] _ in
                self?.lock.lock()
                self?.locationContinuations.removeValue(forKey: id)
                if self?.locationContinuations.isEmpty == true {
                    DispatchQueue.main.async {
                        self?.manager.stopUpdatingLocation()
                    }
                }
                self?.lock.unlock()
            }

            DispatchQueue.main.async {
                self.manager.startUpdatingLocation()
            }

            // Immediately yield last known location if available
            if let location = manager.location {
                continuation.yield(location.coordinate)
            }
        }
    }

    func getCurrentLocation() async -> CLLocationCoordinate2D? {
        if let location = manager.location {
            return location.coordinate
        }

        // Request a single location update
        return await withCheckedContinuation { continuation in
            var didResume = false

            let stream = locationStream()
            Task {
                for await coordinate in stream {
                    if !didResume {
                        didResume = true
                        continuation.resume(returning: coordinate)
                    }
                    break
                }
                if !didResume {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationManager: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationContinuation?.resume(returning: manager.authorizationStatus)
        authorizationContinuation = nil

        // Start updates if authorized
        if manager.authorizationStatus == .authorizedWhenInUse ||
           manager.authorizationStatus == .authorizedAlways {
            lock.lock()
            let hasListeners = !locationContinuations.isEmpty
            lock.unlock()

            if hasListeners {
                manager.startUpdatingLocation()
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        lock.lock()
        let continuations = Array(locationContinuations.values)
        lock.unlock()

        for continuation in continuations {
            continuation.yield(location.coordinate)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Log error but don't terminate streams - location may recover
        print("Location error: \(error.localizedDescription)")
    }
}

// MARK: - Mock Data

private let mockRestaurants: [RestaurantAnnotation] = [
    RestaurantAnnotation(
        id: "1",
        name: "The Gluten Free Bakery",
        coordinate: CLLocationCoordinate2D(latitude: 51.5074, longitude: -0.1278),
        trustScore: TrustScore(professionalScore: 38, communityScore: 32, freshnessScore: 22),
        cuisineType: "Bakery",
        priceLevel: .moderate,
        isCeliacSafe: true,
        distance: 250
    ),
    RestaurantAnnotation(
        id: "2",
        name: "Celiac Kitchen London",
        coordinate: CLLocationCoordinate2D(latitude: 51.5094, longitude: -0.1300),
        trustScore: TrustScore(professionalScore: 35, communityScore: 28, freshnessScore: 20),
        cuisineType: "British",
        priceLevel: .expensive,
        isCeliacSafe: true,
        distance: 450
    ),
    RestaurantAnnotation(
        id: "3",
        name: "Pizza Express",
        coordinate: CLLocationCoordinate2D(latitude: 51.5054, longitude: -0.1250),
        trustScore: TrustScore(professionalScore: 15, communityScore: 25, freshnessScore: 18),
        cuisineType: "Italian",
        priceLevel: .moderate,
        isCeliacSafe: false,
        distance: 600
    )
]
