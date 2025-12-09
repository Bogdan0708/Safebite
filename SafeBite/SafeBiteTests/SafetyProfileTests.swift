import XCTest
@testable import SafeBite

final class SafetyProfileTests: XCTestCase {

    // MARK: - isCeliacSafe Tests

    func test_SafetyProfile_isCeliacSafe_withDedicatedKitchen() {
        var profile = SafetyProfile()
        profile.hasDedicatedKitchen = true

        XCTAssertTrue(profile.isCeliacSafe)
    }

    func test_SafetyProfile_isCeliacSafe_withCoeliacUKCertification() {
        var profile = SafetyProfile()
        profile.certifications = [.coeliacUK]

        XCTAssertTrue(profile.isCeliacSafe)
    }

    func test_SafetyProfile_isCeliacSafe_withAICCertification() {
        var profile = SafetyProfile()
        profile.certifications = [.aic]

        XCTAssertTrue(profile.isCeliacSafe)
    }

    func test_SafetyProfile_isCeliacSafe_withGFCOCertification() {
        var profile = SafetyProfile()
        profile.certifications = [.gfco]

        XCTAssertTrue(profile.isCeliacSafe)
    }

    func test_SafetyProfile_isNotCeliacSafe_withOnlySeparateFryer() {
        var profile = SafetyProfile()
        profile.hasSeparateFryer = true
        profile.hasDedicatedKitchen = false

        XCTAssertFalse(profile.isCeliacSafe)
    }

    func test_SafetyProfile_isNotCeliacSafe_withOnlyTrainedStaff() {
        var profile = SafetyProfile()
        profile.hasTrainedStaff = true
        profile.staffTrainingType = .coeliacUK

        XCTAssertFalse(profile.isCeliacSafe)
    }

    func test_SafetyProfile_isNotCeliacSafe_withNonQualifyingCertification() {
        var profile = SafetyProfile()
        profile.certifications = [.dzg] // DZG doesn't qualify for isCeliacSafe

        XCTAssertFalse(profile.isCeliacSafe)
    }

    // MARK: - Staff Training Level Tests

    func test_SafetyProfile_staffTrainingLevel_whenNotTrained() {
        let profile = SafetyProfile()

        XCTAssertNil(profile.staffTrainingLevel)
    }

    func test_SafetyProfile_staffTrainingLevel_withTrainingType() {
        var profile = SafetyProfile()
        profile.hasTrainedStaff = true
        profile.staffTrainingType = .allerTrain

        XCTAssertEqual(profile.staffTrainingLevel, "AllerTrain")
    }

    func test_SafetyProfile_staffTrainingLevel_withoutSpecificType() {
        var profile = SafetyProfile()
        profile.hasTrainedStaff = true
        profile.staffTrainingType = nil

        XCTAssertEqual(profile.staffTrainingLevel, "Staff trained")
    }

    // MARK: - Certification Tests

    func test_SafetyProfile_primaryCertification() {
        var profile = SafetyProfile()
        profile.certifications = [.coeliacUK, .gfco]

        XCTAssertEqual(profile.certification, .coeliacUK)
    }

    func test_SafetyProfile_noCertification() {
        let profile = SafetyProfile()

        XCTAssertNil(profile.certification)
    }

    // MARK: - Default Values Tests

    func test_SafetyProfile_defaultValues() {
        let profile = SafetyProfile()

        XCTAssertFalse(profile.hasDedicatedKitchen)
        XCTAssertFalse(profile.hasSeparateFryer)
        XCTAssertFalse(profile.hasTrainedStaff)
        XCTAssertNil(profile.staffTrainingType)
        XCTAssertFalse(profile.hasCrossContaminationProtocols)
        XCTAssertNil(profile.protocolDescription)
        XCTAssertTrue(profile.certifications.isEmpty)
        XCTAssertFalse(profile.hasDedicatedMenu)
        XCTAssertNil(profile.notes)
    }

    // MARK: - Equatable Tests

    func test_SafetyProfile_equality() {
        var profile1 = SafetyProfile()
        profile1.hasDedicatedKitchen = true
        profile1.certifications = [.coeliacUK]

        var profile2 = SafetyProfile()
        profile2.hasDedicatedKitchen = true
        profile2.certifications = [.coeliacUK]

        var profile3 = SafetyProfile()
        profile3.hasDedicatedKitchen = false

        XCTAssertEqual(profile1, profile2)
        XCTAssertNotEqual(profile1, profile3)
    }

    // MARK: - Codable Tests

    func test_SafetyProfile_encodeDecode() throws {
        var original = SafetyProfile()
        original.hasDedicatedKitchen = true
        original.hasSeparateFryer = true
        original.hasTrainedStaff = true
        original.staffTrainingType = .coeliacUK
        original.certifications = [.coeliacUK, .gfco]
        original.notes = "Excellent GF options"

        let encoder = JSONEncoder()
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(SafetyProfile.self, from: data)

        XCTAssertEqual(original, decoded)
    }
}

// MARK: - Certification Display Name Tests

final class GlutenFreeCertificationTests: XCTestCase {

    func test_certification_displayNames() {
        XCTAssertEqual(GlutenFreeCertification.coeliacUK.displayName, "Coeliac UK Accredited")
        XCTAssertEqual(GlutenFreeCertification.aic.displayName, "AIC (Italian Coeliac Association)")
        XCTAssertEqual(GlutenFreeCertification.dzg.displayName, "DZG (German Coeliac Society)")
        XCTAssertEqual(GlutenFreeCertification.gfco.displayName, "GFCO Certified")
        XCTAssertEqual(GlutenFreeCertification.gffp.displayName, "Gluten-Free Food Program")
    }

    func test_certification_allCases() {
        let allCases = GlutenFreeCertification.allCases
        XCTAssertEqual(allCases.count, 5)
    }
}

// MARK: - Staff Training Type Tests

final class StaffTrainingTypeTests: XCTestCase {

    func test_staffTrainingType_displayNames() {
        XCTAssertEqual(StaffTrainingType.allerTrain.displayName, "AllerTrain")
        XCTAssertEqual(StaffTrainingType.servSafeAllergens.displayName, "ServSafe Allergens")
        XCTAssertEqual(StaffTrainingType.coeliacUK.displayName, "Coeliac UK Accredited")
        XCTAssertEqual(StaffTrainingType.inHouse.displayName, "In-House Training")
        XCTAssertEqual(StaffTrainingType.unknown.displayName, "Unknown")
    }

    func test_staffTrainingType_allCases() {
        let allCases = StaffTrainingType.allCases
        XCTAssertEqual(allCases.count, 5)
    }
}
