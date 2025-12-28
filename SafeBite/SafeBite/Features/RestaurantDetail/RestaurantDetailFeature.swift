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

// MARK: - Write Review Feature

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
        var isVerifiedReviewer: Bool = false

        // Submission state
        var isSubmitting: Bool = false
        var submissionError: String?

        var canSubmit: Bool {
            safetyRating > 0 &&
            foodRating > 0 &&
            staffKnowledgeRating > 0 &&
            !reviewText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            hadReaction != nil
        }
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
        case submitFailed(String)
        case cancelTapped

        // Safety quiz
        case showSafetyQuizTapped
        case safetyQuizAnswered(Bool)
        case dismissSafetyQuiz
    }

    @Dependency(\.dismiss) var dismiss

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .safetyRatingChanged(let rating):
                state.safetyRating = min(5, max(1, rating))
                return .none

            case .foodRatingChanged(let rating):
                state.foodRating = min(5, max(1, rating))
                return .none

            case .staffKnowledgeChanged(let rating):
                state.staffKnowledgeRating = min(5, max(1, rating))
                return .none

            case .reviewTextChanged(let text):
                state.reviewText = text
                return .none

            case .hadReactionSelected(let hadReaction):
                state.hadReaction = hadReaction
                return .none

            case .itemsOrderedChanged(let items):
                state.itemsOrdered = items
                return .none

            case .addPhotoTapped:
                // Photo picker handled by view
                return .none

            case .photoAdded(let data):
                if state.photos.count < 5 { // Max 5 photos
                    state.photos.append(data)
                }
                return .none

            case .removePhoto(let index):
                if index >= 0 && index < state.photos.count {
                    state.photos.remove(at: index)
                }
                return .none

            case .submitTapped:
                guard state.canSubmit else { return .none }

                // If not verified and hasn't completed quiz, show quiz first
                if !state.isVerifiedReviewer && !state.safetyQuizCompleted {
                    state.showSafetyQuiz = true
                    return .none
                }

                state.isSubmitting = true
                state.submissionError = nil

                let restaurantId = state.restaurantId
                let review = FirestoreReview(
                    id: UUID().uuidString,
                    restaurantId: restaurantId,
                    userId: "", // Will be set by service
                    userDisplayName: "", // Will be set by service
                    isVerifiedReviewer: state.isVerifiedReviewer || state.safetyQuizCompleted,
                    content: state.reviewText,
                    safetyRating: state.safetyRating,
                    foodRating: state.foodRating,
                    hadReaction: state.hadReaction ?? false,
                    itemsOrdered: state.itemsOrdered.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) },
                    photoURLs: [], // Photos uploaded separately
                    createdAt: Date(),
                    updatedAt: Date()
                )

                return .run { send in
                    do {
                        try await FirestoreService.shared.submitReview(review)
                        await send(.submitCompleted)
                    } catch {
                        await send(.submitFailed(error.localizedDescription))
                    }
                }

            case .submitCompleted:
                state.isSubmitting = false
                return .run { _ in
                    await dismiss()
                }

            case .submitFailed(let error):
                state.isSubmitting = false
                state.submissionError = error
                return .none

            case .cancelTapped:
                return .run { _ in
                    await dismiss()
                }

            case .showSafetyQuizTapped:
                state.showSafetyQuiz = true
                return .none

            case .safetyQuizAnswered(let passed):
                state.safetyQuizCompleted = true
                state.isVerifiedReviewer = passed
                state.showSafetyQuiz = false
                // If passed and can submit, auto-submit
                if passed && state.canSubmit {
                    return .send(.submitTapped)
                }
                return .none

            case .dismissSafetyQuiz:
                state.showSafetyQuiz = false
                return .none
            }
        }
    }
}

// MARK: - Report Incident Feature

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

        // Submission state
        var isSubmitting: Bool = false
        var submissionError: String?
        var isAnonymous: Bool = false

        var canSubmit: Bool {
            !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !suspectedItem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    enum Action: Equatable {
        case dateChanged(Date)
        case descriptionChanged(String)
        case itemsOrderedChanged(String)
        case suspectedItemChanged(String)
        case staffNotifiedToggled
        case severitySelected(IncidentSeverity)
        case anonymousToggled
        case submitTapped
        case submitCompleted
        case submitFailed(String)
        case cancelTapped
    }

    @Dependency(\.dismiss) var dismiss

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .dateChanged(let date):
                // Don't allow future dates
                state.incidentDate = min(date, Date())
                return .none

            case .descriptionChanged(let text):
                state.description = text
                return .none

            case .itemsOrderedChanged(let items):
                state.itemsOrdered = items
                return .none

            case .suspectedItemChanged(let item):
                state.suspectedItem = item
                return .none

            case .staffNotifiedToggled:
                state.staffNotified.toggle()
                return .none

            case .severitySelected(let severity):
                state.severity = severity
                return .none

            case .anonymousToggled:
                state.isAnonymous.toggle()
                return .none

            case .submitTapped:
                guard state.canSubmit else { return .none }

                state.isSubmitting = true
                state.submissionError = nil

                let incident = FirestoreIncidentReport(
                    id: UUID().uuidString,
                    restaurantId: state.restaurantId,
                    userId: "", // Will be set by service, or empty if anonymous
                    description: state.description,
                    suspectedItems: state.itemsOrdered.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) },
                    incidentDate: state.incidentDate,
                    wasStaffNotified: state.staffNotified,
                    severity: state.severity.rawValue.lowercased(),
                    createdAt: Date()
                )

                return .run { send in
                    do {
                        try await FirestoreService.shared.submitIncidentReport(incident)
                        await send(.submitCompleted)
                    } catch {
                        await send(.submitFailed(error.localizedDescription))
                    }
                }

            case .submitCompleted:
                state.isSubmitting = false
                return .run { _ in
                    await dismiss()
                }

            case .submitFailed(let error):
                state.isSubmitting = false
                state.submissionError = error
                return .none

            case .cancelTapped:
                return .run { _ in
                    await dismiss()
                }
            }
        }
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
