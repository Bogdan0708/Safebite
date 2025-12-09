import XCTest
@testable import SafeBite

final class TrustScoreTests: XCTestCase {

    // MARK: - Trust Score Calculation Tests

    func test_TrustScore_totalCalculation() {
        // Given
        let score = TrustScore(
            professionalScore: 30,
            communityScore: 25,
            freshnessScore: 20
        )

        // Then
        XCTAssertEqual(score.total, 75)
    }

    func test_TrustScore_maxCapsAt100() {
        // Given - scores that would exceed 100
        let score = TrustScore(
            professionalScore: 40,
            communityScore: 35,
            freshnessScore: 30 // Total would be 105
        )

        // Then
        XCTAssertEqual(score.total, 100)
    }

    func test_TrustScore_zeroScores() {
        // Given
        let score = TrustScore(
            professionalScore: 0,
            communityScore: 0,
            freshnessScore: 0
        )

        // Then
        XCTAssertEqual(score.total, 0)
        XCTAssertEqual(score.level, .unverified)
    }

    // MARK: - Trust Level Tests

    func test_TrustLevel_verifiedSafe_80AndAbove() {
        XCTAssertEqual(TrustLevel(score: 80), .verified)
        XCTAssertEqual(TrustLevel(score: 90), .verified)
        XCTAssertEqual(TrustLevel(score: 100), .verified)
    }

    func test_TrustLevel_communitySafe_60to79() {
        XCTAssertEqual(TrustLevel(score: 60), .communitySafe)
        XCTAssertEqual(TrustLevel(score: 70), .communitySafe)
        XCTAssertEqual(TrustLevel(score: 79), .communitySafe)
    }

    func test_TrustLevel_useCaution_30to59() {
        XCTAssertEqual(TrustLevel(score: 30), .useCaution)
        XCTAssertEqual(TrustLevel(score: 45), .useCaution)
        XCTAssertEqual(TrustLevel(score: 59), .useCaution)
    }

    func test_TrustLevel_unverified_below30() {
        XCTAssertEqual(TrustLevel(score: 0), .unverified)
        XCTAssertEqual(TrustLevel(score: 15), .unverified)
        XCTAssertEqual(TrustLevel(score: 29), .unverified)
    }

    // MARK: - Trust Score Level Property Tests

    func test_TrustScore_levelProperty_verified() {
        let score = TrustScore(
            professionalScore: 35,
            communityScore: 30,
            freshnessScore: 20
        ) // Total: 85

        XCTAssertEqual(score.level, .verified)
    }

    func test_TrustScore_levelProperty_communitySafe() {
        let score = TrustScore(
            professionalScore: 25,
            communityScore: 20,
            freshnessScore: 20
        ) // Total: 65

        XCTAssertEqual(score.level, .communitySafe)
    }

    func test_TrustScore_levelProperty_useCaution() {
        let score = TrustScore(
            professionalScore: 15,
            communityScore: 15,
            freshnessScore: 15
        ) // Total: 45

        XCTAssertEqual(score.level, .useCaution)
    }

    func test_TrustScore_levelProperty_unverified() {
        let score = TrustScore(
            professionalScore: 5,
            communityScore: 10,
            freshnessScore: 5
        ) // Total: 20

        XCTAssertEqual(score.level, .unverified)
    }

    // MARK: - Breakdown Tests

    func test_TrustScore_breakdownContainsAllThreeCategories() {
        let score = TrustScore(
            professionalScore: 30,
            communityScore: 25,
            freshnessScore: 20
        )

        let breakdown = score.breakdown
        XCTAssertEqual(breakdown.count, 3)

        // Check Professional Verification
        let professional = breakdown[0]
        XCTAssertEqual(professional.0, "Professional Verification")
        XCTAssertEqual(professional.1, 30)
        XCTAssertEqual(professional.2, 40)

        // Check Community Validation
        let community = breakdown[1]
        XCTAssertEqual(community.0, "Community Validation")
        XCTAssertEqual(community.1, 25)
        XCTAssertEqual(community.2, 35)

        // Check Data Freshness
        let freshness = breakdown[2]
        XCTAssertEqual(freshness.0, "Data Freshness")
        XCTAssertEqual(freshness.1, 20)
        XCTAssertEqual(freshness.2, 25)
    }

    // MARK: - Equatable Tests

    func test_TrustScore_equality() {
        let score1 = TrustScore(
            professionalScore: 30,
            communityScore: 25,
            freshnessScore: 20
        )

        let score2 = TrustScore(
            professionalScore: 30,
            communityScore: 25,
            freshnessScore: 20
        )

        let score3 = TrustScore(
            professionalScore: 31,
            communityScore: 25,
            freshnessScore: 20
        )

        XCTAssertEqual(score1, score2)
        XCTAssertNotEqual(score1, score3)
    }

    // MARK: - Codable Tests

    func test_TrustScore_encodeDecode() throws {
        let original = TrustScore(
            professionalScore: 30,
            communityScore: 25,
            freshnessScore: 20
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(TrustScore.self, from: data)

        XCTAssertEqual(original, decoded)
    }
}
