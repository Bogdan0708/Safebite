import Foundation
import CoreLocation

/// Service for fetching restaurant data from Google Places API
actor GooglePlacesService {
    private let apiKey: String
    private let baseURL = "https://places.googleapis.com/v1"
    private let session: URLSession

    // Cache for reducing API calls (24-hour max per ToS)
    private var cache: [String: CachedResponse] = [:]
    private let cacheExpiration: TimeInterval = 24 * 60 * 60 // 24 hours

    init(apiKey: String) {
        self.apiKey = apiKey
        self.session = URLSession.shared
    }

    // MARK: - Nearby Search

    /// Search for gluten-free restaurants nearby
    func searchNearby(
        latitude: Double,
        longitude: Double,
        radius: Int = 5000, // 5km default
        types: [String] = ["restaurant", "bakery", "cafe"]
    ) async throws -> [GooglePlace] {
        let cacheKey = "nearby_\(latitude)_\(longitude)_\(radius)"

        if let cached = cache[cacheKey], !cached.isExpired {
            return cached.places
        }

        let endpoint = "\(baseURL)/places:searchNearby"

        let requestBody: [String: Any] = [
            "includedTypes": types,
            "maxResultCount": 20,
            "locationRestriction": [
                "circle": [
                    "center": [
                        "latitude": latitude,
                        "longitude": longitude
                    ],
                    "radius": radius
                ]
            ]
        ]

        let places = try await makeRequest(
            endpoint: endpoint,
            method: "POST",
            body: requestBody,
            fieldMask: "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.priceLevel,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours"
        )

        cache[cacheKey] = CachedResponse(places: places, timestamp: Date())
        return places
    }

    // MARK: - Text Search

    /// Search for restaurants by query
    func searchByText(
        query: String,
        latitude: Double,
        longitude: Double,
        radius: Int = 10000
    ) async throws -> [GooglePlace] {
        let cacheKey = "text_\(query)_\(latitude)_\(longitude)"

        if let cached = cache[cacheKey], !cached.isExpired {
            return cached.places
        }

        let endpoint = "\(baseURL)/places:searchText"

        // Add gluten-free context to search
        let enhancedQuery = "\(query) gluten free"

        let requestBody: [String: Any] = [
            "textQuery": enhancedQuery,
            "locationBias": [
                "circle": [
                    "center": [
                        "latitude": latitude,
                        "longitude": longitude
                    ],
                    "radius": radius
                ]
            ],
            "maxResultCount": 20
        ]

        let places = try await makeRequest(
            endpoint: endpoint,
            method: "POST",
            body: requestBody,
            fieldMask: "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.priceLevel,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours"
        )

        cache[cacheKey] = CachedResponse(places: places, timestamp: Date())
        return places
    }

    // MARK: - Place Details

    /// Get detailed information about a place
    func getPlaceDetails(placeId: String) async throws -> GooglePlace {
        let cacheKey = "details_\(placeId)"

        if let cached = cache[cacheKey], !cached.isExpired, let place = cached.places.first {
            return place
        }

        let endpoint = "\(baseURL)/places/\(placeId)"

        var request = URLRequest(url: URL(string: endpoint)!)
        request.httpMethod = "GET"
        request.setValue(apiKey, forHTTPHeaderField: "X-Goog-Api-Key")
        request.setValue("places.id,places.displayName,places.formattedAddress,places.location,places.types,places.priceLevel,places.rating,places.userRatingCount,places.photos,places.regularOpeningHours,places.websiteUri,places.nationalPhoneNumber,places.reviews", forHTTPHeaderField: "X-Goog-FieldMask")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw GooglePlacesError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw GooglePlacesError.httpError(statusCode: httpResponse.statusCode)
        }

        let place = try JSONDecoder().decode(GooglePlace.self, from: data)
        cache[cacheKey] = CachedResponse(places: [place], timestamp: Date())
        return place
    }

    // MARK: - Photo URL

    /// Get photo URL for a place photo reference
    func getPhotoURL(photoReference: String, maxWidth: Int = 400) -> URL? {
        var components = URLComponents(string: "\(baseURL)/\(photoReference)/media")
        components?.queryItems = [
            URLQueryItem(name: "maxWidthPx", value: "\(maxWidth)"),
            URLQueryItem(name: "key", value: apiKey)
        ]
        return components?.url
    }

    // MARK: - Private Methods

    private func makeRequest(
        endpoint: String,
        method: String,
        body: [String: Any],
        fieldMask: String
    ) async throws -> [GooglePlace] {
        guard let url = URL(string: endpoint) else {
            throw GooglePlacesError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-Goog-Api-Key")
        request.setValue(fieldMask, forHTTPHeaderField: "X-Goog-FieldMask")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw GooglePlacesError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            // Try to parse error message
            if let errorResponse = try? JSONDecoder().decode(GooglePlacesErrorResponse.self, from: data) {
                throw GooglePlacesError.apiError(message: errorResponse.error.message)
            }
            throw GooglePlacesError.httpError(statusCode: httpResponse.statusCode)
        }

        let placesResponse = try JSONDecoder().decode(GooglePlacesResponse.self, from: data)
        return placesResponse.places ?? []
    }

    // MARK: - Clear Cache

    func clearCache() {
        cache.removeAll()
    }
}

// MARK: - Response Models

struct GooglePlacesResponse: Codable {
    let places: [GooglePlace]?
}

struct GooglePlace: Codable, Identifiable {
    let id: String
    let displayName: DisplayName?
    let formattedAddress: String?
    let location: Location?
    let types: [String]?
    let priceLevel: String?
    let rating: Double?
    let userRatingCount: Int?
    let photos: [Photo]?
    let regularOpeningHours: OpeningHours?
    let websiteUri: String?
    let nationalPhoneNumber: String?
    let reviews: [GoogleReview]?

    struct DisplayName: Codable {
        let text: String
        let languageCode: String?
    }

    struct Location: Codable {
        let latitude: Double
        let longitude: Double
    }

    struct Photo: Codable {
        let name: String
        let widthPx: Int?
        let heightPx: Int?
    }

    struct OpeningHours: Codable {
        let openNow: Bool?
        let periods: [Period]?
        let weekdayDescriptions: [String]?

        struct Period: Codable {
            let open: TimePoint?
            let close: TimePoint?

            struct TimePoint: Codable {
                let day: Int?
                let hour: Int?
                let minute: Int?
            }
        }
    }

    struct GoogleReview: Codable {
        let name: String?
        let relativePublishTimeDescription: String?
        let rating: Int?
        let text: TextContent?
        let authorAttribution: AuthorAttribution?

        struct TextContent: Codable {
            let text: String
            let languageCode: String?
        }

        struct AuthorAttribution: Codable {
            let displayName: String?
            let photoUri: String?
        }
    }
}

struct GooglePlacesErrorResponse: Codable {
    let error: ErrorDetail

    struct ErrorDetail: Codable {
        let code: Int
        let message: String
        let status: String
    }
}

// MARK: - Cache

private struct CachedResponse {
    let places: [GooglePlace]
    let timestamp: Date

    var isExpired: Bool {
        Date().timeIntervalSince(timestamp) > 24 * 60 * 60
    }
}

// MARK: - Errors

enum GooglePlacesError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int)
    case apiError(message: String)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode):
            return "HTTP error: \(statusCode)"
        case .apiError(let message):
            return message
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        }
    }
}

// MARK: - Conversion to App Models

extension GooglePlace {
    /// Convert to app's RestaurantAnnotation model
    func toRestaurantAnnotation(userLocation: CLLocationCoordinate2D?) -> RestaurantAnnotation? {
        guard let location = location else { return nil }

        let coordinate = CLLocationCoordinate2D(
            latitude: location.latitude,
            longitude: location.longitude
        )

        var distance: Double?
        if let userLocation = userLocation {
            let userCL = CLLocation(latitude: userLocation.latitude, longitude: userLocation.longitude)
            let placeCL = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
            distance = userCL.distance(from: placeCL)
        }

        // Convert price level
        let priceLevel: PriceLevel
        switch self.priceLevel {
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

        // Determine cuisine type from types
        let cuisineType = determineCuisineType(from: types ?? [])

        // Create initial trust score (will be enriched with our data)
        let trustScore = TrustScore(
            professionalScore: 0,
            communityScore: 0,
            freshnessScore: 0
        )

        var annotation = RestaurantAnnotation(
            id: id,
            name: displayName?.text ?? "Unknown",
            coordinate: coordinate,
            trustScore: trustScore,
            cuisineType: cuisineType,
            priceLevel: priceLevel,
            isCeliacSafe: false, // Will be determined by our data
            distance: distance
        )

        // Set opening hours status from Google Places data
        annotation.isOpenNow = regularOpeningHours?.openNow

        return annotation
    }

    private func determineCuisineType(from types: [String]) -> String {
        // Map Google place types to cuisine
        let typeMapping: [String: String] = [
            "italian_restaurant": "Italian",
            "pizza_restaurant": "Pizza",
            "french_restaurant": "French",
            "spanish_restaurant": "Spanish",
            "german_restaurant": "German",
            "indian_restaurant": "Indian",
            "chinese_restaurant": "Chinese",
            "japanese_restaurant": "Japanese",
            "thai_restaurant": "Thai",
            "mexican_restaurant": "Mexican",
            "american_restaurant": "American",
            "mediterranean_restaurant": "Mediterranean",
            "bakery": "Bakery",
            "cafe": "Café",
            "seafood_restaurant": "Seafood",
            "vegetarian_restaurant": "Vegetarian",
            "vegan_restaurant": "Vegan",
            "british_restaurant": "British"
        ]

        for type in types {
            if let cuisine = typeMapping[type] {
                return cuisine
            }
        }

        return "Restaurant"
    }
}
