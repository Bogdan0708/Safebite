import SwiftUI
import ComposableArchitecture
import PhotosUI

/// Review submission view with safety quiz for verification
struct ReviewView: View {
    @Bindable var store: StoreOf<ReviewFeature>
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                // Restaurant header
                Section {
                    HStack {
                        Image(systemName: "fork.knife")
                            .font(.title2)
                            .foregroundStyle(.green)
                            .frame(width: 44, height: 44)
                            .background(Color.green.opacity(0.1))
                            .clipShape(Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(store.restaurantName)
                                .font(.headline)
                            Text("Your review helps keep our community safe")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Ratings section
                Section("Ratings") {
                    RatingRow(
                        title: "Safety Rating",
                        subtitle: "How safe did you feel eating here?",
                        icon: "shield.fill",
                        rating: store.safetyRating
                    ) { newRating in
                        store.send(.safetyRatingChanged(newRating))
                    }

                    RatingRow(
                        title: "Food Rating",
                        subtitle: "Quality and taste of the food",
                        icon: "star.fill",
                        rating: store.foodRating
                    ) { newRating in
                        store.send(.foodRatingChanged(newRating))
                    }

                    RatingRow(
                        title: "Staff Knowledge",
                        subtitle: "Understanding of gluten-free requirements",
                        icon: "person.fill.checkmark",
                        rating: store.staffKnowledgeRating
                    ) { newRating in
                        store.send(.staffKnowledgeChanged(newRating))
                    }
                }

                // Reaction question
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Label("Did you have a reaction?", systemImage: "exclamationmark.triangle")
                            .font(.headline)

                        ForEach(ReviewFeature.ReactionAnswer.allCases.filter { $0 != .notAnswered }, id: \.self) { answer in
                            Button {
                                store.send(.hadReactionSelected(answer))
                            } label: {
                                HStack {
                                    Image(systemName: answer == .noReaction ? "checkmark.circle" : "exclamationmark.circle")
                                        .foregroundStyle(answer == .noReaction ? .green : .red)

                                    Text(answer.rawValue)
                                        .foregroundStyle(.primary)

                                    Spacer()

                                    if store.hadReaction == answer {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(.green)
                                    }
                                }
                                .padding(.vertical, 8)
                            }
                            .buttonStyle(.plain)
                        }

                        if store.hadReaction == .hadReaction {
                            TextField("What symptoms did you experience?", text: $store.reactionDetails.sending(\.reactionDetailsChanged), axis: .vertical)
                                .lineLimit(2...4)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                } header: {
                    Text("Safety Experience")
                } footer: {
                    Text("This information helps protect others with similar sensitivities.")
                }

                // Review text
                Section("Your Review") {
                    TextField("Share your experience...", text: $store.reviewText.sending(\.reviewTextChanged), axis: .vertical)
                        .lineLimit(5...10)

                    TextField("Items ordered (optional)", text: $store.itemsOrdered.sending(\.itemsOrderedChanged))
                }

                // Photos
                Section {
                    if store.photos.isEmpty {
                        Button {
                            store.send(.addPhotoTapped)
                        } label: {
                            Label("Add Photos", systemImage: "camera")
                        }
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(store.photos) { photo in
                                    PhotoThumbnail(photoData: photo) {
                                        store.send(.removePhoto(photo.id))
                                    }
                                }

                                Button {
                                    store.send(.addPhotoTapped)
                                } label: {
                                    VStack {
                                        Image(systemName: "plus")
                                            .font(.title2)
                                    }
                                    .frame(width: 80, height: 80)
                                    .background(Color(.systemGray5))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                            }
                        }
                    }
                } header: {
                    Text("Photos")
                } footer: {
                    Text("Photos of the menu, your dish, or GF signage help verify your review.")
                }

                // Verified reviewer badge
                Section {
                    if store.isVerifiedReviewer {
                        HStack {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundStyle(.blue)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Verified Reviewer")
                                    .font(.subheadline.weight(.medium))
                                Text("Your reviews carry extra trust weight")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                        Button {
                            store.send(.startSafetyQuiz)
                        } label: {
                            HStack {
                                Image(systemName: "graduationcap.fill")
                                    .foregroundStyle(.blue)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Become a Verified Reviewer")
                                        .font(.subheadline.weight(.medium))
                                    Text("Take a quick safety quiz to earn your badge")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } footer: {
                    Text("Verified reviewers have demonstrated understanding of coeliac safety requirements.")
                }

                // Submit button
                Section {
                    Button {
                        store.send(.submitTapped)
                    } label: {
                        if store.isSubmitting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Submit Review")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(!store.canSubmit || store.isSubmitting)
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Write Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        store.send(.cancelTapped)
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $store.showSafetyQuiz.sending(\.dismissSafetyQuiz)) {
                SafetyQuizView(
                    state: $store.safetyQuizState,
                    onAnswer: { q, a in store.send(.safetyQuiz(.answerSelected(questionIndex: q, answerIndex: a))) },
                    onNext: { store.send(.safetyQuiz(.nextQuestion)) },
                    onPrevious: { store.send(.safetyQuiz(.previousQuestion)) },
                    onSubmit: { store.send(.safetyQuiz(.submitQuiz)) },
                    onDismiss: { store.send(.dismissSafetyQuiz) }
                )
            }
        }
    }
}

// MARK: - Rating Row

struct RatingRow: View {
    let title: String
    let subtitle: String
    let icon: String
    let rating: Int
    let onRatingChanged: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { star in
                    Button {
                        onRatingChanged(star)
                    } label: {
                        Image(systemName: star <= rating ? "star.fill" : "star")
                            .font(.title2)
                            .foregroundStyle(star <= rating ? .yellow : .gray.opacity(0.3))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Photo Thumbnail

struct PhotoThumbnail: View {
    let photoData: ReviewFeature.PhotoData
    let onRemove: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let image = UIImage(data: photoData.data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 80, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.white, .red)
            }
            .offset(x: 8, y: -8)
        }
    }
}

// MARK: - Safety Quiz View

struct SafetyQuizView: View {
    @Binding var state: SafetyQuizState
    let onAnswer: (Int, Int) -> Void
    let onNext: () -> Void
    let onPrevious: () -> Void
    let onSubmit: () -> Void
    let onDismiss: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var currentQuestion: SafetyQuizState.Question {
        SafetyQuizState.questions[state.currentQuestion]
    }

    private var isLastQuestion: Bool {
        state.currentQuestion == SafetyQuizState.questions.count - 1
    }

    private var hasAnsweredCurrent: Bool {
        state.answers[state.currentQuestion] != nil
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Progress
                VStack(spacing: 8) {
                    ProgressView(value: Double(state.currentQuestion + 1), total: Double(SafetyQuizState.questions.count))
                        .tint(.green)

                    Text("Question \(state.currentQuestion + 1) of \(SafetyQuizState.questions.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                // Question
                VStack(alignment: .leading, spacing: 16) {
                    Text(currentQuestion.text)
                        .font(.title3.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(spacing: 12) {
                        ForEach(currentQuestion.options.indices, id: \.self) { index in
                            AnswerButton(
                                text: currentQuestion.options[index],
                                isSelected: state.answers[state.currentQuestion] == index,
                                isCorrect: state.hasCompleted ? index == currentQuestion.correctAnswer : nil
                            ) {
                                onAnswer(state.currentQuestion, index)
                            }
                        }
                    }
                }
                .padding()

                Spacer()

                // Navigation buttons
                HStack(spacing: 16) {
                    if state.currentQuestion > 0 {
                        Button {
                            onPrevious()
                        } label: {
                            Label("Previous", systemImage: "chevron.left")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }

                    if isLastQuestion {
                        Button {
                            onSubmit()
                        } label: {
                            Text("Submit Quiz")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(!hasAnsweredCurrent)
                    } else {
                        Button {
                            onNext()
                        } label: {
                            Label("Next", systemImage: "chevron.right")
                                .labelStyle(.titleAndIcon)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(!hasAnsweredCurrent)
                    }
                }
                .padding()
            }
            .navigationTitle("Safety Quiz")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onDismiss()
                    }
                }
            }
        }
        .interactiveDismissDisabled()
    }
}

struct AnswerButton: View {
    let text: String
    let isSelected: Bool
    let isCorrect: Bool?  // nil means quiz not completed
    let action: () -> Void

    private var backgroundColor: Color {
        if let correct = isCorrect {
            if isSelected && correct { return .green.opacity(0.2) }
            if isSelected && !correct { return .red.opacity(0.2) }
            if correct { return .green.opacity(0.1) }
        }
        return isSelected ? Color.green.opacity(0.15) : Color(.systemGray6)
    }

    private var borderColor: Color {
        if let correct = isCorrect {
            if isSelected && correct { return .green }
            if isSelected && !correct { return .red }
            if correct { return .green }
        }
        return isSelected ? .green : .clear
    }

    var body: some View {
        Button(action: action) {
            HStack {
                Text(text)
                    .multilineTextAlignment(.leading)

                Spacer()

                if isSelected {
                    Image(systemName: isCorrect == true ? "checkmark.circle.fill" :
                            isCorrect == false ? "xmark.circle.fill" : "checkmark.circle.fill")
                        .foregroundStyle(isCorrect == true ? .green :
                                         isCorrect == false ? .red : .green)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(backgroundColor)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(borderColor, lineWidth: 2)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(isCorrect != nil)  // Disable after quiz submitted
    }
}

// MARK: - Quiz Results View

struct QuizResultsView: View {
    let score: Int
    let totalQuestions: Int
    let passed: Bool
    let onDismiss: () -> Void
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            // Icon
            Image(systemName: passed ? "checkmark.seal.fill" : "xmark.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(passed ? .green : .red)

            // Title
            Text(passed ? "Congratulations!" : "Not Quite")
                .font(.title.bold())

            // Score
            Text("\(score) / \(totalQuestions) correct")
                .font(.title2)

            // Message
            Text(passed ?
                 "You're now a Verified Reviewer! Your reviews will carry extra trust weight in our community." :
                 "You need at least \(SafetyQuizState.passingScore)/\(totalQuestions) to pass. Review the coeliac safety guidelines and try again.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            // Actions
            VStack(spacing: 12) {
                if passed {
                    Button {
                        onDismiss()
                    } label: {
                        Text("Continue")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                } else {
                    Button {
                        onRetry()
                    } label: {
                        Text("Try Again")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)

                    Button {
                        onDismiss()
                    } label: {
                        Text("Skip for Now")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding()
    }
}

// MARK: - Preview

#Preview {
    ReviewView(
        store: Store(
            initialState: ReviewFeature.State(
                restaurantId: "1",
                restaurantName: "The GF Kitchen"
            )
        ) {
            ReviewFeature()
        }
    )
}
