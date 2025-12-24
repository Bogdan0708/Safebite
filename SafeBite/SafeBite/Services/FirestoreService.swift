import Foundation
import FirebaseFirestore
import FirebaseAuth

// MARK: - Firestore Service

/// Firestore database service for SafeBite
/// Handles restaurant data, reviews, and user preferences sync
actor FirestoreService {
    static let shared = FirestoreService()

    private let db = Firestore.firestore()

    private init() {
        // Configure Firestore settings for offline persistence
        let settings = FirestoreSettings()
        settings.cacheSettings = PersistentCacheSettings(sizeBytes: 100 * 1024 * 1024 as NSNumber) // 100MB cache
        db.settings = settings
    }

    // MARK: - Restaurant Operations

    /// Fetch restaurants near a location
    func fetchRestaurants(
        latitude: Double,
        longitude: Double,
        radiusKm: Double = 10
    ) async throws -> [FirestoreRestaurant] {
        // Note: Firestore doesn't support native geo queries
        // For production, consider using GeoFirestore or geohashing
        // For now, fetch all and filter client-side (only works for small datasets)

        let snapshot = try await db.collection("restaurants")
            .whereField("isActive", isEqualTo: true)
            .limit(to: 100)
            .getDocuments()

        return snapshot.documents.compactMap { doc in
            try? doc.data(as: FirestoreRestaurant.self)
        }
    }

    /// Fetch a single restaurant by ID
    func fetchRestaurant(id: String) async throws -> FirestoreRestaurant? {
        let doc = try await db.collection("restaurants").document(id).getDocument()
        return try? doc.data(as: FirestoreRestaurant.self)
    }

    /// Fetch restaurant by Google Place ID
    func fetchRestaurant(googlePlaceId: String) async throws -> FirestoreRestaurant? {
        let snapshot = try await db.collection("restaurants")
            .whereField("googlePlaceId", isEqualTo: googlePlaceId)
            .limit(to: 1)
            .getDocuments()

        return snapshot.documents.first.flatMap { try? $0.data(as: FirestoreRestaurant.self) }
    }

    /// Create or update a restaurant (admin/verified users only)
    func saveRestaurant(_ restaurant: FirestoreRestaurant) async throws {
        try db.collection("restaurants").document(restaurant.id).setData(from: restaurant, merge: true)
    }

    // MARK: - Review Operations

    /// Fetch reviews for a restaurant
    func fetchReviews(restaurantId: String, limit: Int = 20) async throws -> [FirestoreReview] {
        let snapshot = try await db.collection("reviews")
            .whereField("restaurantId", isEqualTo: restaurantId)
            .order(by: "createdAt", descending: true)
            .limit(to: limit)
            .getDocuments()

        return snapshot.documents.compactMap { doc in
            try? doc.data(as: FirestoreReview.self)
        }
    }

    /// Submit a new review
    func submitReview(_ review: FirestoreReview) async throws {
        guard Auth.auth().currentUser != nil else {
            throw FirestoreError.notAuthenticated
        }

        // Save review
        try db.collection("reviews").document(review.id).setData(from: review)

        // Update restaurant's review count and average
        let restaurantRef = db.collection("restaurants").document(review.restaurantId)
        try await db.runTransaction { transaction, errorPointer in
            do {
                let restaurantDoc = try transaction.getDocument(restaurantRef)
                let currentCount = restaurantDoc.data()?["reviewCount"] as? Int ?? 0
                let currentAvg = restaurantDoc.data()?["averageSafetyRating"] as? Double ?? 0

                let newCount = currentCount + 1
                let newAvg = ((currentAvg * Double(currentCount)) + Double(review.safetyRating)) / Double(newCount)

                transaction.updateData([
                    "reviewCount": newCount,
                    "averageSafetyRating": newAvg,
                    "lastReviewAt": FieldValue.serverTimestamp()
                ], forDocument: restaurantRef)

                return nil
            } catch {
                errorPointer?.pointee = error as NSError
                return nil
            }
        }
    }

    /// Delete a review (user can only delete their own)
    func deleteReview(reviewId: String) async throws {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreError.notAuthenticated
        }

        let reviewDoc = try await db.collection("reviews").document(reviewId).getDocument()
        guard let reviewUserId = reviewDoc.data()?["userId"] as? String,
              reviewUserId == userId else {
            throw FirestoreError.permissionDenied
        }

        try await db.collection("reviews").document(reviewId).delete()
    }

    // MARK: - Saved Restaurants

    /// Fetch user's saved restaurants
    func fetchSavedRestaurants() async throws -> [FirestoreSavedRestaurant] {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreError.notAuthenticated
        }

        let snapshot = try await db.collection("users").document(userId)
            .collection("savedRestaurants")
            .order(by: "savedAt", descending: true)
            .getDocuments()

        return snapshot.documents.compactMap { doc in
            try? doc.data(as: FirestoreSavedRestaurant.self)
        }
    }

    /// Save a restaurant to favorites
    func saveRestaurantToFavorites(_ saved: FirestoreSavedRestaurant) async throws {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreError.notAuthenticated
        }

        try db.collection("users").document(userId)
            .collection("savedRestaurants").document(saved.restaurantId)
            .setData(from: saved)
    }

    /// Remove a restaurant from favorites
    func removeSavedRestaurant(restaurantId: String) async throws {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreError.notAuthenticated
        }

        try await db.collection("users").document(userId)
            .collection("savedRestaurants").document(restaurantId)
            .delete()
    }

    // MARK: - User Profile

    /// Fetch user profile
    func fetchUserProfile() async throws -> FirestoreUserProfile? {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreError.notAuthenticated
        }

        let doc = try await db.collection("users").document(userId).getDocument()
        return try? doc.data(as: FirestoreUserProfile.self)
    }

    /// Update user profile
    func updateUserProfile(_ updates: [String: Any]) async throws {
        guard let userId = Auth.auth().currentUser?.uid else {
            throw FirestoreError.notAuthenticated
        }

        try await db.collection("users").document(userId).updateData(updates)
    }

    // MARK: - Incident Reports

    /// Submit an incident report
    func submitIncidentReport(_ incident: FirestoreIncidentReport) async throws {
        guard Auth.auth().currentUser != nil else {
            throw FirestoreError.notAuthenticated
        }

        try db.collection("incidents").document(incident.id).setData(from: incident)

        // Update restaurant incident count
        try await db.collection("restaurants").document(incident.restaurantId).updateData([
            "incidentCount": FieldValue.increment(Int64(1)),
            "lastIncidentAt": FieldValue.serverTimestamp()
        ])
    }

    // MARK: - Trust Score Data

    /// Fetch SafeBite trust data for a restaurant
    func fetchTrustData(restaurantId: String) async throws -> FirestoreTrustData? {
        let doc = try await db.collection("trustScores").document(restaurantId).getDocument()
        return try? doc.data(as: FirestoreTrustData.self)
    }

    /// Fetch trust data for multiple Google Place IDs
    /// Returns a map of GooglePlaceID -> FirestoreTrustData
    func fetchTrustData(for googlePlaceIds: [String]) async throws -> [String: FirestoreTrustData] {
        guard !googlePlaceIds.isEmpty else { return [:] }

        // 1. Resolve Google Place IDs to Restaurant IDs
        // Firestore 'in' query limit is 30. We assume input is usually ~20 (Google Places page size)
        // For larger sets, we'd need to chunk this.
        let uniqueIds = Array(Set(googlePlaceIds).prefix(30))
        
        let restaurantSnapshot = try await db.collection("restaurants")
            .whereField("googlePlaceId", in: uniqueIds)
            .getDocuments()

        var restaurantIdMap: [String: String] = [:] // RestaurantID -> GooglePlaceID
        var firestoreIds: [String] = []

        for doc in restaurantSnapshot.documents {
            if let googleId = doc.data()["googlePlaceId"] as? String {
                restaurantIdMap[doc.documentID] = googleId
                firestoreIds.append(doc.documentID)
            }
        }

        guard !firestoreIds.isEmpty else { return [:] }

        // 2. Fetch Trust Scores
        let trustSnapshot = try await db.collection("trustScores")
            .whereField("restaurantId", in: firestoreIds)
            .getDocuments()

        var results: [String: FirestoreTrustData] = [:]

        for doc in trustSnapshot.documents {
            if let trustData = try? doc.data(as: FirestoreTrustData.self),
               let googleId = restaurantIdMap[trustData.restaurantId] {
                results[googleId] = trustData
            }
        }

        return results
    }
}

// MARK: - Firestore Models

struct FirestoreRestaurant: Codable, Identifiable {
    @DocumentID var id: String?
    let googlePlaceId: String?
    let name: String
    let address: String
    let city: String
    let country: String
    let latitude: Double
    let longitude: Double
    let cuisineTypes: [String]
    let priceLevel: Int

    // Safety Profile
    let hasDedicatedKitchen: Bool
    let hasSeparateFryer: Bool
    let hasTrainedStaff: Bool
    let certifications: [String]

    // Verification
    let verificationMethod: String
    let verifiedBy: String?
    let lastVerifiedAt: Date?
    let professionalScore: Int

    // Stats
    let reviewCount: Int
    let averageSafetyRating: Double
    let incidentCount: Int

    // Meta
    let isActive: Bool
    let createdAt: Date
    let updatedAt: Date

    var nonOptionalId: String {
        id ?? UUID().uuidString
    }
}

struct FirestoreReview: Codable, Identifiable {
    @DocumentID var id: String?
    let restaurantId: String
    let userId: String
    let userDisplayName: String
    let isVerifiedReviewer: Bool

    let content: String
    let safetyRating: Int // 1-5
    let foodRating: Int // 1-5
    let hadReaction: Bool
    let itemsOrdered: [String]
    let photoURLs: [String]

    let createdAt: Date
    let updatedAt: Date

    var nonOptionalId: String {
        id ?? UUID().uuidString
    }
}

struct FirestoreSavedRestaurant: Codable, Identifiable {
    @DocumentID var id: String?
    let restaurantId: String
    let restaurantName: String
    let city: String
    let trustScore: Int
    let savedAt: Date
    let hasVisited: Bool
    let lastVisitedAt: Date?
    let notes: String?

    var nonOptionalId: String {
        id ?? UUID().uuidString
    }
}

struct FirestoreUserProfile: Codable, Identifiable {
    @DocumentID var id: String?
    let email: String
    let displayName: String
    let severityLevel: String
    let isPremium: Bool
    let reviewCount: Int
    let isVerifiedReviewer: Bool
    let quizPassedAt: Date?

    // GDPR
    let gdprConsentGiven: Bool
    let gdprConsentDate: Date?
    let analyticsConsent: Bool
    let marketingConsent: Bool

    // Preferences
    let preferredLanguage: String
    let preferredCurrency: String

    let createdAt: Date
    let lastActiveAt: Date

    var nonOptionalId: String {
        id ?? UUID().uuidString
    }
}

struct FirestoreIncidentReport: Codable, Identifiable {
    @DocumentID var id: String?
    let restaurantId: String
    let userId: String
    let description: String
    let suspectedItems: [String]
    let incidentDate: Date
    let wasStaffNotified: Bool
    let severity: String // mild, moderate, severe
    let createdAt: Date

    var nonOptionalId: String {
        id ?? UUID().uuidString
    }
}

struct FirestoreTrustData: Codable, Identifiable {
    @DocumentID var id: String?
    let restaurantId: String
    let professionalScore: Int
    let communityScore: Int
    let freshnessScore: Int
    let totalScore: Int
    let trustLevel: String
    let lastCalculatedAt: Date

    var nonOptionalId: String {
        id ?? UUID().uuidString
    }
}

// MARK: - Firestore Errors

enum FirestoreError: LocalizedError {
    case notAuthenticated
    case permissionDenied
    case notFound
    case invalidData
    case networkError

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "You must be signed in to perform this action."
        case .permissionDenied:
            return "You don't have permission to perform this action."
        case .notFound:
            return "The requested data was not found."
        case .invalidData:
            return "The data format is invalid."
        case .networkError:
            return "Network error. Please check your connection."
        }
    }
}
