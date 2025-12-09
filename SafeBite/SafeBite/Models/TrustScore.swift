import Foundation
import SwiftUI

/// Trust score composed of three weighted factors
struct TrustScore: Codable, Equatable {
    /// Score from professional/owner verification (0-40 points max)
    let professionalScore: Int

    /// Score from community reviews and validation (0-35 points max)
    let communityScore: Int

    /// Score based on data freshness/recency (0-25 points max)
    let freshnessScore: Int

    /// Total composite score (0-100)
    var total: Int {
        min(100, professionalScore + communityScore + freshnessScore)
    }

    /// Trust level category
    var level: TrustLevel {
        TrustLevel(score: total)
    }

    /// Breakdown for UI display
    var breakdown: [(String, Int, Int, Color)] {
        [
            ("Professional Verification", professionalScore, 40, .blue),
            ("Community Validation", communityScore, 35, .orange),
            ("Data Freshness", freshnessScore, 25, .green)
        ]
    }
}

// MARK: - Trust Level

enum TrustLevel: String, CaseIterable {
    case verified = "Verified Safe"
    case communitySafe = "Community Safe"
    case useCaution = "Use Caution"
    case unverified = "Unverified"

    init(score: Int) {
        switch score {
        case 80...100: self = .verified
        case 60..<80: self = .communitySafe
        case 30..<60: self = .useCaution
        default: self = .unverified
        }
    }

    var color: Color {
        switch self {
        case .verified: return .green
        case .communitySafe: return .yellow
        case .useCaution: return .orange
        case .unverified: return .gray
        }
    }

    var icon: String {
        switch self {
        case .verified: return "checkmark.shield.fill"
        case .communitySafe: return "person.2.fill"
        case .useCaution: return "exclamationmark.triangle.fill"
        case .unverified: return "questionmark.circle.fill"
        }
    }

    var description: String {
        switch self {
        case .verified:
            return "This restaurant has been professionally verified as celiac-safe with documented protocols."
        case .communitySafe:
            return "Multiple community members have reported safe experiences here."
        case .useCaution:
            return "Limited verification. Ask staff about cross-contamination protocols before ordering."
        case .unverified:
            return "No verification data available. Exercise caution and verify with staff."
        }
    }

    /// Short description for map pins
    var shortDescription: String {
        switch self {
        case .verified: return "Professionally verified"
        case .communitySafe: return "Community verified"
        case .useCaution: return "Ask about protocols"
        case .unverified: return "Not yet verified"
        }
    }
}

// MARK: - Trust Score View Component

struct TrustScoreBadge: View {
    let trustScore: TrustScore
    var showBreakdown: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Main score display
            HStack(spacing: 12) {
                // Score circle
                ZStack {
                    Circle()
                        .stroke(trustScore.level.color.opacity(0.3), lineWidth: 4)
                        .frame(width: 60, height: 60)

                    Circle()
                        .trim(from: 0, to: Double(trustScore.total) / 100.0)
                        .stroke(trustScore.level.color, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .frame(width: 60, height: 60)
                        .rotationEffect(.degrees(-90))

                    VStack(spacing: 0) {
                        Text("\(trustScore.total)")
                            .font(.title2.bold())
                        Text("/100")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }

                // Level info
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Image(systemName: trustScore.level.icon)
                            .foregroundStyle(trustScore.level.color)
                        Text(trustScore.level.rawValue)
                            .font(.headline)
                    }
                    Text(trustScore.level.shortDescription)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Score breakdown
            if showBreakdown {
                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Text("Score Breakdown")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)

                    ForEach(trustScore.breakdown, id: \.0) { item in
                        ScoreBreakdownRow(
                            title: item.0,
                            score: item.1,
                            maxScore: item.2,
                            color: item.3
                        )
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
    }
}

struct ScoreBreakdownRow: View {
    let title: String
    let score: Int
    let maxScore: Int
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.caption)
                Spacer()
                Text("\(score)/\(maxScore)")
                    .font(.caption.bold())
                    .foregroundStyle(color)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(color.opacity(0.2))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(color)
                        .frame(width: geometry.size.width * CGFloat(score) / CGFloat(maxScore), height: 4)
                }
            }
            .frame(height: 4)
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        TrustScoreBadge(
            trustScore: TrustScore(professionalScore: 35, communityScore: 30, freshnessScore: 20),
            showBreakdown: true
        )

        TrustScoreBadge(
            trustScore: TrustScore(professionalScore: 20, communityScore: 25, freshnessScore: 15),
            showBreakdown: true
        )

        TrustScoreBadge(
            trustScore: TrustScore(professionalScore: 0, communityScore: 15, freshnessScore: 10),
            showBreakdown: false
        )
    }
    .padding()
    .background(Color(.systemGray6))
}
