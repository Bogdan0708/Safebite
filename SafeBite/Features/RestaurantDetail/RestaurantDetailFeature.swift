import Foundation
import ComposableArchitecture
import CoreLocation

/// Restaurant detail feature for viewing full restaurant information
@Reducer
struct RestaurantDetailFeature {
    @ObservableState
    struct State: Equatable {
        var restaurant: Restaurant
        var isLoading: Bool = false
        var isSaved: Bool = false

        // Reviews
        var reviews: [Review] = []
        var isLoadingReviews: Bool = false

        // Sheets
        var showWriteReview: Bool = false
        var showReportIncident: Bool = false
        var showShareSheet: Bool = false
        var showAllReviews: Bool = false

        // "What to Ask" prompts based on cuisine
        var whatToAskPrompts: [String] {
            WhatToAskService.prompts(for: restaurant.cuisineType)
        }
    }

    enum Action: Equatable {
        case onAppear
        case restaurantLoaded(Restaurant)
        case reviewsLoaded([Review])

        // Navigation
        case directionsButtonTapped
        case callButtonTapped
        case websiteButtonTapped
        case shareButtonTapped

        // Save
        case saveToggled
        case saveUpdated(Bool)

        // Reviews
        case writeReviewTapped
        case reportIncidentTapped
        case seeAllReviewsTapped
        case reviewHelpfulTapped(Review.ID)

        // Sheets
        case dismissWriteReview
        case dismissReportIncident
        case dismissShareSheet
        case dismissAllReviews

        // Child actions
        case writeReview(WriteReviewFeature.Action)
        case reportIncident(ReportIncidentFeature.Action)
    }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                state.isLoading = true
                state.isLoadingReviews = true
                // Load full restaurant details and reviews
                return .none

            case .restaurantLoaded(let restaurant):
                state.restaurant = restaurant
                state.isLoading = false
                return .none

            case .reviewsLoaded(let reviews):
                state.reviews = reviews
                state.isLoadingReviews = false
                return .none

            case .directionsButtonTapped:
                // Open Apple Maps with directions
                let coordinate = state.restaurant.coordinate
                if let url = URL(string: "maps://?daddr=\(coordinate.latitude),\(coordinate.longitude)&dirflg=d") {
                    // Open URL handled by view
                }
                return .none

            case .callButtonTapped:
                // Open phone app
                if let phone = state.restaurant.phoneNumber,
                   let url = URL(string: "tel://\(phone.replacingOccurrences(of: " ", with: ""))") {
                    // Open URL handled by view
                }
                return .none

            case .websiteButtonTapped:
                // Open website
                return .none

            case .shareButtonTapped:
                state.showShareSheet = true
                return .none

            case .saveToggled:
                state.isSaved.toggle()
                // Persist to SwiftData
                return .none

            case .saveUpdated(let saved):
                state.isSaved = saved
                return .none

            case .writeReviewTapped:
                state.showWriteReview = true
                return .none

            case .reportIncidentTapped:
                state.showReportIncident = true
                return .none

            case .seeAllReviewsTapped:
                state.showAllReviews = true
                return .none

            case .reviewHelpfulTapped(let reviewId):
                // Mark review as helpful
                if let index = state.reviews.firstIndex(where: { $0.id == reviewId }) {
                    state.reviews[index].helpfulCount += 1
                }
                return .none

            case .dismissWriteReview:
                state.showWriteReview = false
                return .none

            case .dismissReportIncident:
                state.showReportIncident = false
                return .none

            case .dismissShareSheet:
                state.showShareSheet = false
                return .none

            case .dismissAllReviews:
                state.showAllReviews = false
                return .none

            case .writeReview, .reportIncident:
                return .none
            }
        }
    }
}

// MARK: - What To Ask Service

struct WhatToAskService {
    static func prompts(for cuisineType: String) -> [String] {
        switch cuisineType.lowercased() {
        case "italian", "pizza":
            return [
                "Does your pasta come from a dedicated cooking station?",
                "Is your pizza base made in a separate area?",
                "Do you use separate water for gluten-free pasta?",
                "Are your sauces made fresh or from a jar?"
            ]
        case "asian", "chinese", "japanese", "thai", "vietnamese":
            return [
                "Does your soy sauce contain wheat?",
                "Do you use a separate wok for gluten-free orders?",
                "Is your rice cooked separately from other dishes?",
                "Do you have tamari as a soy sauce alternative?"
            ]
        case "bakery", "cafe", "coffee":
            return [
                "Are gluten-free items prepared in a separate area?",
                "Do you change gloves between orders?",
                "Is there a dedicated gluten-free toaster?",
                "How do you prevent flour cross-contamination?"
            ]
        case "indian":
            return [
                "Are your poppadoms fried in a dedicated fryer?",
                "Which dishes are naturally gluten-free?",
                "Do any curries contain flour as a thickener?",
                "Is your tandoori bread made separately?"
            ]
        case "mexican":
            return [
                "Are your corn tortillas 100% corn?",
                "Is the fryer used only for corn items?",
                "Do you use flour in any sauces?",
                "Are your chips fried separately?"
            ]
        case "french":
            return [
                "Can sauces be made without roux?",
                "Do you have gluten-free bread options?",
                "Is the dessert station separate?",
                "Which dishes can be modified to be gluten-free?"
            ]
        default:
            return [
                "Do you have a dedicated fryer for gluten-free items?",
                "How do you prevent cross-contamination?",
                "Is your kitchen staff trained in coeliac requirements?",
                "Can you show me your allergen menu?"
            ]
        }
    }
}

// MARK: - Placeholder Reducers for Child Features

@Reducer
struct WriteReviewFeature {
    @ObservableState
    struct State: Equatable {
        var restaurantId: String
        var restaurantName: String
        var safetyRating: Int = 0
        var foodRating: Int = 0
        var staffKnowledgeRating: Int = 0
        var reviewText: String = ""
        var hadReaction: Bool? = nil
        var itemsOrdered: String = ""
        var photos: [Data] = []

        // Safety quiz (required for first review)
        var showSafetyQuiz: Bool = false
        var safetyQuizCompleted: Bool = false
    }

    enum Action: Equatable {
        case safetyRatingChanged(Int)
        case foodRatingChanged(Int)
        case staffKnowledgeChanged(Int)
        case reviewTextChanged(String)
        case hadReactionSelected(Bool)
        case itemsOrderedChanged(String)
        case addPhotoTapped
        case photoAdded(Data)
        case removePhoto(Int)
        case submitTapped
        case submitCompleted
        case cancelTapped

        // Safety quiz
        case safetyQuizAnswered(Bool)
    }
}

@Reducer
struct ReportIncidentFeature {
    @ObservableState
    struct State: Equatable {
        var restaurantId: String
        var restaurantName: String
        var incidentDate: Date = Date()
        var description: String = ""
        var itemsOrdered: String = ""
        var suspectedItem: String = ""
        var staffNotified: Bool = false
        var severity: IncidentSeverity = .moderate
    }

    enum Action: Equatable {
        case dateChanged(Date)
        case descriptionChanged(String)
        case itemsOrderedChanged(String)
        case suspectedItemChanged(String)
        case staffNotifiedToggled
        case severitySelected(IncidentSeverity)
        case submitTapped
        case submitCompleted
        case cancelTapped
    }
}

enum IncidentSeverity: String, CaseIterable, Codable {
    case mild = "Mild"
    case moderate = "Moderate"
    case severe = "Severe"
    case hospitalized = "Hospitalized"

    var description: String {
        switch self {
        case .mild: return "Minor discomfort"
        case .moderate: return "Significant symptoms"
        case .severe: return "Severe reaction"
        case .hospitalized: return "Required medical attention"
        }
    }
}
