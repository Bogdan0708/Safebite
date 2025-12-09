import SwiftUI
import ComposableArchitecture
import MapKit

/// Restaurant detail view showing full safety information
struct RestaurantDetailView: View {
    @Bindable var store: StoreOf<RestaurantDetailFeature>
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Header with photo
                headerSection

                VStack(spacing: 24) {
                    // Trust Score Card
                    trustScoreCard

                    // Quick Actions
                    quickActionsBar

                    // Safety Checklist
                    safetyChecklistSection

                    // What to Ask
                    whatToAskSection

                    // Opening Hours
                    if let hours = store.restaurant.openingHoursText {
                        openingHoursSection(hours)
                    }

                    // Reviews
                    reviewsSection

                    // Report Issue
                    reportSection
                }
                .padding()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        store.send(.saveToggled)
                    } label: {
                        Image(systemName: store.isSaved ? "heart.fill" : "heart")
                            .foregroundStyle(store.isSaved ? .red : .primary)
                    }

                    Button {
                        store.send(.shareButtonTapped)
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
        }
        .sheet(isPresented: $store.showWriteReview.sending(\.dismissWriteReview)) {
            WriteReviewView(
                restaurantId: store.restaurant.id,
                restaurantName: store.restaurant.name
            )
        }
        .sheet(isPresented: $store.showReportIncident.sending(\.dismissReportIncident)) {
            ReportIncidentView(
                restaurantId: store.restaurant.id,
                restaurantName: store.restaurant.name
            )
        }
        .onAppear {
            store.send(.onAppear)
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        ZStack(alignment: .bottomLeading) {
            // Photo placeholder
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .frame(height: 200)
                .overlay {
                    Image(systemName: "photo")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                }

            // Gradient overlay
            LinearGradient(
                colors: [.clear, .black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Restaurant info
            VStack(alignment: .leading, spacing: 4) {
                Text(store.restaurant.name)
                    .font(.title.bold())
                    .foregroundStyle(.white)

                HStack(spacing: 8) {
                    Text(store.restaurant.cuisineType)
                    Text("•")
                    Text(store.restaurant.priceLevel.symbol)

                    if let rating = store.restaurant.googleRating {
                        Text("•")
                        HStack(spacing: 2) {
                            Image(systemName: "star.fill")
                                .font(.caption)
                            Text(String(format: "%.1f", rating))
                        }
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))

                Text(store.restaurant.address)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding()
        }
    }

    // MARK: - Trust Score Card

    private var trustScoreCard: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Trust Score")
                    .font(.headline)
                Spacer()
                TrustLevelBadge(level: store.restaurant.trustScore.level)
            }

            // Overall score
            HStack(alignment: .top, spacing: 20) {
                // Big score circle
                ZStack {
                    Circle()
                        .stroke(store.restaurant.trustScore.level.color.opacity(0.3), lineWidth: 8)
                        .frame(width: 80, height: 80)

                    Circle()
                        .trim(from: 0, to: CGFloat(store.restaurant.trustScore.total) / 100)
                        .stroke(
                            store.restaurant.trustScore.level.color,
                            style: StrokeStyle(lineWidth: 8, lineCap: .round)
                        )
                        .frame(width: 80, height: 80)
                        .rotationEffect(.degrees(-90))

                    VStack(spacing: 0) {
                        Text("\(store.restaurant.trustScore.total)")
                            .font(.title.bold())
                        Text("/ 100")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                // Score breakdown
                VStack(alignment: .leading, spacing: 12) {
                    ScoreBreakdownRow(
                        icon: "checkmark.seal.fill",
                        label: "Professional Verification",
                        score: store.restaurant.trustScore.professionalScore,
                        maxScore: 40,
                        color: .blue
                    )

                    ScoreBreakdownRow(
                        icon: "person.3.fill",
                        label: "Community Validation",
                        score: store.restaurant.trustScore.communityScore,
                        maxScore: 35,
                        color: .green
                    )

                    ScoreBreakdownRow(
                        icon: "clock.fill",
                        label: "Data Freshness",
                        score: store.restaurant.trustScore.freshnessScore,
                        maxScore: 25,
                        color: .orange
                    )
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.1), radius: 8, y: 4)
    }

    // MARK: - Quick Actions

    private var quickActionsBar: some View {
        HStack(spacing: 0) {
            QuickActionButton(icon: "arrow.triangle.turn.up.right.diamond.fill", label: "Directions") {
                let coord = store.restaurant.coordinate
                if let url = URL(string: "maps://?daddr=\(coord.latitude),\(coord.longitude)&dirflg=d") {
                    openURL(url)
                }
            }

            Divider().frame(height: 40)

            QuickActionButton(icon: "phone.fill", label: "Call") {
                if let phone = store.restaurant.phoneNumber,
                   let url = URL(string: "tel://\(phone.replacingOccurrences(of: " ", with: ""))") {
                    openURL(url)
                }
            }

            Divider().frame(height: 40)

            QuickActionButton(icon: "globe", label: "Website") {
                if let website = store.restaurant.website,
                   let url = URL(string: website) {
                    openURL(url)
                }
            }

            Divider().frame(height: 40)

            QuickActionButton(icon: "square.and.arrow.up", label: "Share") {
                store.send(.shareButtonTapped)
            }
        }
        .padding(.vertical, 8)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Safety Checklist

    private var safetyChecklistSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Safety Checklist")
                .font(.headline)

            VStack(spacing: 8) {
                SafetyCheckItem(
                    icon: "checkmark.shield.fill",
                    title: "Coeliac Safe",
                    isVerified: store.restaurant.safetyProfile.isCeliacSafe,
                    details: store.restaurant.safetyProfile.isCeliacSafe ? "Verified safe for coeliacs" : "Not verified"
                )

                SafetyCheckItem(
                    icon: "flame.fill",
                    title: "Dedicated Kitchen",
                    isVerified: store.restaurant.safetyProfile.hasDedicatedKitchen,
                    details: store.restaurant.safetyProfile.hasDedicatedKitchen ? "Separate GF preparation area" : "Shared kitchen"
                )

                SafetyCheckItem(
                    icon: "frying.pan.fill",
                    title: "Separate Fryer",
                    isVerified: store.restaurant.safetyProfile.hasSeparateFryer,
                    details: store.restaurant.safetyProfile.hasSeparateFryer ? "Dedicated GF fryer" : "Shared fryer"
                )

                SafetyCheckItem(
                    icon: "person.fill.checkmark",
                    title: "Trained Staff",
                    isVerified: store.restaurant.safetyProfile.hasTrainedStaff,
                    details: store.restaurant.safetyProfile.staffTrainingLevel ?? "Training status unknown"
                )

                if let cert = store.restaurant.safetyProfile.certification {
                    SafetyCheckItem(
                        icon: "rosette",
                        title: "Certified",
                        isVerified: true,
                        details: cert.displayName
                    )
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - What to Ask

    private var whatToAskSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "questionmark.bubble.fill")
                    .foregroundStyle(.blue)
                Text("What to Ask")
                    .font(.headline)
            }

            Text("Questions to ensure your safety at this \(store.restaurant.cuisineType.lowercased()) restaurant:")
                .font(.caption)
                .foregroundStyle(.secondary)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(store.whatToAskPrompts, id: \.self) { prompt in
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "circle.fill")
                            .font(.system(size: 6))
                            .foregroundStyle(.blue)
                            .padding(.top, 6)

                        Text(prompt)
                            .font(.subheadline)
                    }
                }
            }
        }
        .padding()
        .background(Color.blue.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Opening Hours

    private func openingHoursSection(_ hours: [String]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "clock.fill")
                    .foregroundStyle(.green)
                Text("Opening Hours")
                    .font(.headline)

                Spacer()

                if store.restaurant.isOpenNow == true {
                    Text("Open Now")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.green.opacity(0.2))
                        .foregroundStyle(.green)
                        .clipShape(Capsule())
                } else if store.restaurant.isOpenNow == false {
                    Text("Closed")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.red.opacity(0.2))
                        .foregroundStyle(.red)
                        .clipShape(Capsule())
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                ForEach(hours, id: \.self) { day in
                    Text(day)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Reviews Section

    private var reviewsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Community Reviews")
                    .font(.headline)

                Spacer()

                if !store.reviews.isEmpty {
                    Button("See All") {
                        store.send(.seeAllReviewsTapped)
                    }
                    .font(.subheadline)
                }
            }

            if store.isLoadingReviews {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding()
            } else if store.reviews.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "text.bubble")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)

                    Text("No reviews yet")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Button("Be the first to review") {
                        store.send(.writeReviewTapped)
                    }
                    .buttonStyle(.bordered)
                }
                .frame(maxWidth: .infinity)
                .padding()
            } else {
                // Show first 3 reviews
                ForEach(store.reviews.prefix(3)) { review in
                    ReviewCard(review: review) {
                        store.send(.reviewHelpfulTapped(review.id))
                    }
                }
            }

            // Write review button
            Button {
                store.send(.writeReviewTapped)
            } label: {
                Label("Write a Review", systemImage: "square.and.pencil")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
        }
    }

    // MARK: - Report Section

    private var reportSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Had an Issue?")
                .font(.headline)

            Text("Help keep our community safe by reporting any incidents.")
                .font(.caption)
                .foregroundStyle(.secondary)

            Button {
                store.send(.reportIncidentTapped)
            } label: {
                Label("Report Incident", systemImage: "exclamationmark.triangle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(.orange)
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Supporting Views

struct TrustLevelBadge: View {
    let level: TrustLevel

    var body: some View {
        Text(level.rawValue)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(level.color.opacity(0.15))
            .foregroundStyle(level.color)
            .clipShape(Capsule())
    }
}

struct ScoreBreakdownRow: View {
    let icon: String
    let label: String
    let score: Int
    let maxScore: Int
    let color: Color

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color.gray.opacity(0.2))
                            .frame(height: 4)

                        RoundedRectangle(cornerRadius: 2)
                            .fill(color)
                            .frame(width: geometry.size.width * CGFloat(score) / CGFloat(maxScore), height: 4)
                    }
                }
                .frame(height: 4)
            }

            Text("\(score)/\(maxScore)")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }
}

struct QuickActionButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.title3)
                Text(label)
                    .font(.caption2)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
    }
}

struct SafetyCheckItem: View {
    let icon: String
    let title: String
    let isVerified: Bool
    let details: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(isVerified ? .green : .gray)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.medium))

                Text(details)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: isVerified ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(isVerified ? .green : .red.opacity(0.5))
        }
        .padding(.vertical, 4)
    }
}

struct ReviewCard: View {
    let review: Review
    let onHelpful: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack {
                // Avatar
                Circle()
                    .fill(Color.green.opacity(0.2))
                    .frame(width: 36, height: 36)
                    .overlay {
                        Text(review.userName.prefix(1).uppercased())
                            .font(.subheadline.bold())
                            .foregroundStyle(.green)
                    }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(review.userName)
                            .font(.subheadline.weight(.medium))

                        if review.isVerifiedReviewer {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption2)
                                .foregroundStyle(.blue)
                        }
                    }

                    Text(review.createdAt, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Safety rating
                HStack(spacing: 2) {
                    ForEach(0..<5, id: \.self) { index in
                        Image(systemName: index < review.safetyRating ? "star.fill" : "star")
                            .font(.caption)
                            .foregroundStyle(index < review.safetyRating ? .yellow : .gray.opacity(0.3))
                    }
                }
            }

            // Review text
            if !review.content.isEmpty {
                Text(review.content)
                    .font(.subheadline)
                    .lineLimit(3)
            }

            // Reaction badge
            HStack(spacing: 4) {
                Image(systemName: review.hadReaction ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                Text(review.hadReaction ? "Had a reaction" : "No reaction")
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(review.hadReaction ? Color.red.opacity(0.1) : Color.green.opacity(0.1))
            .foregroundStyle(review.hadReaction ? .red : .green)
            .clipShape(Capsule())

            // Helpful button
            HStack {
                Button(action: onHelpful) {
                    HStack(spacing: 4) {
                        Image(systemName: "hand.thumbsup")
                        Text("Helpful")
                        if review.helpfulCount > 0 {
                            Text("(\(review.helpfulCount))")
                        }
                    }
                    .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }
}

// MARK: - Placeholder Views

struct WriteReviewView: View {
    let restaurantId: String
    let restaurantName: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text("Write Review for \(restaurantName)")
                // TODO: Implement full review form
            }
            .navigationTitle("Write Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

struct ReportIncidentView: View {
    let restaurantId: String
    let restaurantName: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text("Report Incident at \(restaurantName)")
                // TODO: Implement full incident report form
            }
            .navigationTitle("Report Incident")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        RestaurantDetailView(
            store: Store(
                initialState: RestaurantDetailFeature.State(
                    restaurant: Restaurant.preview
                )
            ) {
                RestaurantDetailFeature()
            }
        )
    }
}
