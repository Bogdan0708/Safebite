import XCTest
import ComposableArchitecture
@testable import SafeBite

@MainActor
final class GDPRFeatureTests: XCTestCase {

    // MARK: - Consent Toggle Tests

    func test_analyticsConsentToggle() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        // Initial state is true
        store.state.analyticsConsent = true

        await store.send(.analyticsConsentToggled) {
            $0.analyticsConsent = false
        }

        await store.receive(\.saveConsentSettings)
    }

    func test_marketingConsentToggle() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        // Initial state is false
        store.state.marketingConsent = false

        await store.send(.marketingConsentToggled) {
            $0.marketingConsent = true
        }

        await store.receive(\.saveConsentSettings)
    }

    func test_personalizationConsentToggle() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        store.state.personalizationConsent = true

        await store.send(.personalizationConsentToggled) {
            $0.personalizationConsent = false
        }

        await store.receive(\.saveConsentSettings)
    }

    // MARK: - Delete Confirmation Tests

    func test_deleteDataTapped_showsConfirmation() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        await store.send(.deleteDataTapped) {
            $0.showDeleteConfirmation = true
            $0.deleteConfirmationText = ""
        }
    }

    func test_deleteConfirmationText_canDelete() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        store.state.deleteConfirmationText = "delete"
        XCTAssertTrue(store.state.canDelete)

        store.state.deleteConfirmationText = "DELETE"
        XCTAssertTrue(store.state.canDelete)

        store.state.deleteConfirmationText = "Delete"
        XCTAssertTrue(store.state.canDelete)
    }

    func test_deleteConfirmationText_cannotDelete() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        store.state.deleteConfirmationText = ""
        XCTAssertFalse(store.state.canDelete)

        store.state.deleteConfirmationText = "delet"
        XCTAssertFalse(store.state.canDelete)

        store.state.deleteConfirmationText = "remove"
        XCTAssertFalse(store.state.canDelete)
    }

    func test_dismissDeleteConfirmation() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        store.state.showDeleteConfirmation = true
        store.state.deleteConfirmationText = "delete"

        await store.send(.dismissDeleteConfirmation) {
            $0.showDeleteConfirmation = false
            $0.deleteConfirmationText = ""
        }
    }

    // MARK: - Export Tests

    func test_exportDataTapped_success() async {
        let testURL = URL(fileURLWithPath: "/tmp/test_export.json")

        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient.exportUserData = { testURL }
        }

        await store.send(.exportDataTapped) {
            $0.isLoading = true
            $0.errorMessage = nil
        }

        await store.receive(\.exportCompleted) {
            $0.isLoading = false
            $0.exportedFileURL = testURL
            $0.showExportSuccess = true
        }
    }

    func test_exportDataTapped_failure() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient.exportUserData = {
                throw GDPRError.noDataToExport
            }
        }

        await store.send(.exportDataTapped) {
            $0.isLoading = true
            $0.errorMessage = nil
        }

        await store.receive(\.exportFailed) {
            $0.isLoading = false
            $0.errorMessage = GDPRError.noDataToExport.localizedDescription
        }
    }

    func test_dismissExportSuccess() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        store.state.showExportSuccess = true

        await store.send(.dismissExportSuccess) {
            $0.showExportSuccess = false
        }
    }

    // MARK: - Delete Flow Tests

    func test_deleteConfirmed_success() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient.deleteAllData = { }
        }

        store.state.showDeleteConfirmation = true
        store.state.deleteConfirmationText = "delete"

        await store.send(.deleteConfirmed) {
            $0.isLoading = true
            $0.showDeleteConfirmation = false
            $0.errorMessage = nil
        }

        await store.receive(\.deleteCompleted) {
            $0.isLoading = false
            $0.showDeleteSuccess = true
        }
    }

    func test_deleteConfirmed_cannotDeleteWithoutTyping() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        store.state.deleteConfirmationText = "wrong"

        await store.send(.deleteConfirmed)
        // No state change because canDelete is false
    }

    func test_deleteConfirmed_failure() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient.deleteAllData = {
                throw GDPRError.deleteFailed("Database error")
            }
        }

        store.state.deleteConfirmationText = "delete"

        await store.send(.deleteConfirmed) {
            $0.isLoading = true
            $0.showDeleteConfirmation = false
            $0.errorMessage = nil
        }

        await store.receive(\.deleteFailed) {
            $0.isLoading = false
            $0.errorMessage = "Database error"
        }
    }

    // MARK: - Error Handling Tests

    func test_clearError() async {
        let store = TestStore(initialState: GDPRFeature.State()) {
            GDPRFeature()
        } withDependencies: {
            $0.gdprClient = .testValue
        }

        store.state.errorMessage = "Some error"

        await store.send(.clearError) {
            $0.errorMessage = nil
        }
    }
}
