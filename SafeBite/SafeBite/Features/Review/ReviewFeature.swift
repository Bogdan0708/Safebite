import Foundation
import ComposableArchitecture

/// Review feature for submitting and managing restaurant reviews
@Reducer
struct ReviewFeature {
    @ObservableState
    struct State: Equatable {
        var restaurantId: String
        var restaurantName: String

        // Ratings
        var safetyRating: Int = 0
        var foodRating: Int = 0
        var staffKnowledgeRating: Int = 0

        // Content
        var reviewText: String = ""
        var itemsOrdered: String = ""
        var photos: [PhotoData] = []

        // Safety specific
        var hadReaction: ReactionAnswer = .notAnswered
        var reactionDetails: String = ""

        // Safety Quiz
        var showSafetyQuiz: Bool = false
        var safetyQuizState: SafetyQuizState = .init()
        var isVerifiedReviewer: Bool = false

        // Submission
        var isSubmitting: Bool = false
        var submissionError: String?

        var canSubmit: Bool {
            safetyRating > 0 &&
            foodRating > 0 &&
            staffKnowledgeRating > 0 &&
            !reviewText.isEmpty &&
            hadReaction != .notAnswered
        }
    }

    enum ReactionAnswer: String, Equatable, CaseIterable {
        case notAnswered = "Not Answered"
        case noReaction = "No, I felt safe"
        case hadReaction = "Yes, I had a reaction"
    }

    struct PhotoData: Equatable, Identifiable {
        let id = UUID()
        let data: Data
        let type: PhotoType

        enum PhotoType: String, CaseIterable {
            case menu = "Menu"
            case dish = "Dish"
            case kitchen = "Kitchen"
            case other = "Other"
        }
    }

    enum Action: Equatable {
        // Ratings
        case safetyRatingChanged(Int)
        case foodRatingChanged(Int)
        case staffKnowledgeChanged(Int)

        // Content
        case reviewTextChanged(String)
        case itemsOrderedChanged(String)
        case addPhotoTapped
        case photoAdded(Data, PhotoData.PhotoType)
        case removePhoto(UUID)

        // Safety
        case hadReactionSelected(ReactionAnswer)
        case reactionDetailsChanged(String)

        // Safety Quiz
        case startSafetyQuiz
        case safetyQuiz(SafetyQuizAction)
        case safetyQuizCompleted(passed: Bool)
        case dismissSafetyQuiz

        // Submission
        case submitTapped
        case submitCompleted
        case submitFailed(String)
        case cancelTapped
    }

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .safetyRatingChanged(let rating):
                state.safetyRating = rating
                return .none

            case .foodRatingChanged(let rating):
                state.foodRating = rating
                return .none

            case .staffKnowledgeChanged(let rating):
                state.staffKnowledgeRating = rating
                return .none

            case .reviewTextChanged(let text):
                state.reviewText = text
                return .none

            case .itemsOrderedChanged(let items):
                state.itemsOrdered = items
                return .none

            case .addPhotoTapped:
                // Photo picker will be shown by view
                return .none

            case .photoAdded(let data, let type):
                state.photos.append(PhotoData(data: data, type: type))
                return .none

            case .removePhoto(let id):
                state.photos.removeAll { $0.id == id }
                return .none

            case .hadReactionSelected(let answer):
                state.hadReaction = answer
                return .none

            case .reactionDetailsChanged(let details):
                state.reactionDetails = details
                return .none

            case .startSafetyQuiz:
                state.showSafetyQuiz = true
                state.safetyQuizState = SafetyQuizState()
                return .none

            case .safetyQuiz(let quizAction):
                return handleSafetyQuizAction(&state, quizAction)

            case .safetyQuizCompleted(let passed):
                state.isVerifiedReviewer = passed
                state.showSafetyQuiz = false
                return .none

            case .dismissSafetyQuiz:
                state.showSafetyQuiz = false
                return .none

            case .submitTapped:
                guard state.canSubmit else { return .none }

                // If not verified and haven't taken quiz, prompt quiz
                if !state.isVerifiedReviewer && !state.safetyQuizState.hasCompleted {
                    state.showSafetyQuiz = true
                    return .none
                }

                state.isSubmitting = true
                
                // Simulate submission (TODO: Integrate Firebase)
                return .run { send in
                    try await Task.sleep(nanoseconds: 1 * 1_000_000_000)
                    await send(.submitCompleted)
                }

            case .submitCompleted:
                state.isSubmitting = false
                return .none

            case .submitFailed(let error):
                state.isSubmitting = false
                state.submissionError = error
                return .none

            case .cancelTapped:
                return .none
            }
        }
    }

    private func handleSafetyQuizAction(_ state: inout State, _ action: SafetyQuizAction) -> Effect<Action> {
        switch action {
        case .answerSelected(let questionIndex, let answerIndex):
            state.safetyQuizState.answers[questionIndex] = answerIndex
            return .none

        case .nextQuestion:
            if state.safetyQuizState.currentQuestion < SafetyQuizState.questions.count - 1 {
                state.safetyQuizState.currentQuestion += 1
            }
            return .none

        case .previousQuestion:
            if state.safetyQuizState.currentQuestion > 0 {
                state.safetyQuizState.currentQuestion -= 1
            }
            return .none

        case .submitQuiz:
            state.safetyQuizState.hasCompleted = true
            let passed = state.safetyQuizState.calculateScore() >= SafetyQuizState.passingScore
            return .send(.safetyQuizCompleted(passed: passed))
        }
    }
}

// MARK: - Safety Quiz

enum SafetyQuizAction: Equatable {
    case answerSelected(questionIndex: Int, answerIndex: Int)
    case nextQuestion
    case previousQuestion
    case submitQuiz
}

struct SafetyQuizState: Equatable {
    var currentQuestion: Int = 0
    var answers: [Int: Int] = [:]  // questionIndex: selectedAnswerIndex
    var hasCompleted: Bool = false

    static let passingScore: Int = 8  // Out of 10

    struct Question: Equatable {
        let text: String
        let options: [String]
        let correctAnswer: Int
        let explanation: String
    }

    static let questions: [Question] = [
        Question(
            text: "What is coeliac disease?",
            options: [
                "A food preference",
                "An autoimmune condition triggered by gluten",
                "A temporary food intolerance",
                "An allergy to wheat only"
            ],
            correctAnswer: 1,
            explanation: "Coeliac disease is an autoimmune condition where the immune system attacks the small intestine when gluten is consumed."
        ),
        Question(
            text: "Which of these contains gluten?",
            options: [
                "Rice",
                "Quinoa",
                "Barley",
                "Potatoes"
            ],
            correctAnswer: 2,
            explanation: "Barley contains gluten. Rice, quinoa, and potatoes are naturally gluten-free."
        ),
        Question(
            text: "What is cross-contamination?",
            options: [
                "Mixing different cuisines together",
                "When gluten-free food comes into contact with gluten-containing food or surfaces",
                "Using the same recipe twice",
                "Cooking food at the wrong temperature"
            ],
            correctAnswer: 1,
            explanation: "Cross-contamination occurs when gluten-free food contacts gluten through shared surfaces, utensils, or cooking equipment."
        ),
        Question(
            text: "Why is a dedicated fryer important for coeliacs?",
            options: [
                "It makes food taste better",
                "It cooks food faster",
                "Shared fryers contaminate GF food with gluten from battered items",
                "It's not important at all"
            ],
            correctAnswer: 2,
            explanation: "Shared fryers accumulate gluten from battered foods, making them unsafe for coeliacs even when frying naturally GF items."
        ),
        Question(
            text: "What does 'gluten-free' mean on a menu?",
            options: [
                "The dish contains no gluten ingredients",
                "The dish is 100% safe for coeliacs with no cross-contamination risk",
                "It depends - always ask about preparation methods",
                "The restaurant has a GF kitchen"
            ],
            correctAnswer: 2,
            explanation: "'Gluten-free' on menus can mean different things. Always ask about preparation methods and cross-contamination protocols."
        ),
        Question(
            text: "How much gluten can trigger a reaction in someone with coeliac disease?",
            options: [
                "Only large amounts",
                "As little as 10-50mg (a breadcrumb)",
                "A full slice of bread",
                "There is a safe threshold"
            ],
            correctAnswer: 1,
            explanation: "Even tiny amounts (10-50mg, about the size of a breadcrumb) can trigger immune responses in coeliacs."
        ),
        Question(
            text: "Which sauce commonly contains hidden gluten?",
            options: [
                "Vinaigrette",
                "Soy sauce",
                "Olive oil",
                "Plain butter"
            ],
            correctAnswer: 1,
            explanation: "Traditional soy sauce is made with wheat. Always look for tamari or certified GF soy sauce alternatives."
        ),
        Question(
            text: "What should a restaurant do to prevent cross-contamination?",
            options: [
                "Just remove the gluten ingredient from the dish",
                "Use clean surfaces, utensils, and separate cooking equipment",
                "Cook gluten-free food at higher temperatures",
                "Add extra seasoning to mask any gluten"
            ],
            correctAnswer: 1,
            explanation: "Proper prevention requires clean surfaces, dedicated utensils, and ideally separate cooking equipment."
        ),
        Question(
            text: "If a coeliac accidentally consumes gluten, what typically happens?",
            options: [
                "Nothing if it's a small amount",
                "Symptoms appear within days and can last weeks, with intestinal damage",
                "They just get a mild headache",
                "They develop immunity over time"
            ],
            correctAnswer: 1,
            explanation: "Even small amounts cause intestinal damage and symptoms that can last for weeks. There is no immunity development."
        ),
        Question(
            text: "When reviewing a restaurant for gluten-free safety, what's MOST important to consider?",
            options: [
                "How the food tastes",
                "The price of the menu",
                "Staff knowledge and kitchen protocols for preventing contamination",
                "The restaurant's decor"
            ],
            correctAnswer: 2,
            explanation: "For safety reviews, staff knowledge and proper kitchen protocols are the most critical factors to evaluate."
        )
    ]

    func calculateScore() -> Int {
        var correct = 0
        for (index, question) in Self.questions.enumerated() {
            if answers[index] == question.correctAnswer {
                correct += 1
            }
        }
        return correct
    }
}
