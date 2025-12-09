import Foundation
import ComposableArchitecture

/// GDPR compliance feature for data export and deletion
@Reducer
struct GDPRFeature {
    @ObservableState
    struct State: Equatable {
        var isLoading: Bool = false
        var errorMessage: String?

        // Export
        var exportedFileURL: URL?
        var showExportSuccess: Bool = false
        var showShareSheet: Bool = false

        // Delete
        var showDeleteConfirmation: Bool = false
        var deleteConfirmationText: String = ""
        var showDeleteSuccess: Bool = false

        // Consent
        var analyticsConsent: Bool = true
        var marketingConsent: Bool = false
        var personalizationConsent: Bool = true

        var canDelete: Bool {
            deleteConfirmationText.lowercased() == "delete"
        }
    }

    enum Action: Equatable {
        case onAppear
        case loadConsentSettings

        // Export
        case exportDataTapped
        case exportCompleted(URL)
        case exportFailed(String)
        case dismissExportSuccess
        case shareExportTapped
        case dismissShareSheet

        // Delete
        case deleteDataTapped
        case deleteConfirmationTextChanged(String)
        case deleteConfirmed
        case deleteCompleted
        case deleteFailed(String)
        case dismissDeleteConfirmation
        case dismissDeleteSuccess

        // Consent
        case analyticsConsentToggled
        case marketingConsentToggled
        case personalizationConsentToggled
        case saveConsentSettings

        // Error
        case clearError
    }

    @Dependency(\.gdprClient) var gdprClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                return .send(.loadConsentSettings)

            case .loadConsentSettings:
                state.analyticsConsent = UserDefaults.standard.bool(forKey: "gdpr_analytics_consent")
                state.marketingConsent = UserDefaults.standard.bool(forKey: "gdpr_marketing_consent")
                state.personalizationConsent = UserDefaults.standard.bool(forKey: "gdpr_personalization_consent")

                // Default to true for analytics and personalization if not set
                if !UserDefaults.standard.bool(forKey: "gdpr_consent_set") {
                    state.analyticsConsent = true
                    state.personalizationConsent = true
                }
                return .none

            case .exportDataTapped:
                state.isLoading = true
                state.errorMessage = nil

                return .run { send in
                    do {
                        let url = try await gdprClient.exportUserData()
                        await send(.exportCompleted(url))
                    } catch {
                        await send(.exportFailed(error.localizedDescription))
                    }
                }

            case .exportCompleted(let url):
                state.isLoading = false
                state.exportedFileURL = url
                state.showExportSuccess = true
                return .none

            case .exportFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .dismissExportSuccess:
                state.showExportSuccess = false
                return .none

            case .shareExportTapped:
                state.showShareSheet = true
                return .none

            case .dismissShareSheet:
                state.showShareSheet = false
                return .none

            case .deleteDataTapped:
                state.showDeleteConfirmation = true
                state.deleteConfirmationText = ""
                return .none

            case .deleteConfirmationTextChanged(let text):
                state.deleteConfirmationText = text
                return .none

            case .deleteConfirmed:
                guard state.canDelete else { return .none }

                state.isLoading = true
                state.showDeleteConfirmation = false
                state.errorMessage = nil

                return .run { send in
                    do {
                        try await gdprClient.deleteAllData()
                        await send(.deleteCompleted)
                    } catch {
                        await send(.deleteFailed(error.localizedDescription))
                    }
                }

            case .deleteCompleted:
                state.isLoading = false
                state.showDeleteSuccess = true
                return .none

            case .deleteFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .dismissDeleteConfirmation:
                state.showDeleteConfirmation = false
                state.deleteConfirmationText = ""
                return .none

            case .dismissDeleteSuccess:
                state.showDeleteSuccess = false
                return .none

            case .analyticsConsentToggled:
                state.analyticsConsent.toggle()
                return .send(.saveConsentSettings)

            case .marketingConsentToggled:
                state.marketingConsent.toggle()
                return .send(.saveConsentSettings)

            case .personalizationConsentToggled:
                state.personalizationConsent.toggle()
                return .send(.saveConsentSettings)

            case .saveConsentSettings:
                let analytics = state.analyticsConsent
                let marketing = state.marketingConsent
                let personalization = state.personalizationConsent

                return .run { _ in
                    await gdprClient.saveConsentSettings(analytics, marketing, personalization)
                }

            case .clearError:
                state.errorMessage = nil
                return .none
            }
        }
    }
}

// MARK: - GDPR Client

struct GDPRClient {
    var exportUserData: @Sendable () async throws -> URL
    var deleteAllData: @Sendable () async throws -> Void
    var saveConsentSettings: @Sendable (Bool, Bool, Bool) async -> Void
    var getConsentSettings: @Sendable () -> (analytics: Bool, marketing: Bool, personalization: Bool)
}

extension GDPRClient: DependencyKey {
    static let liveValue = GDPRClient(
        exportUserData: {
            // Export all user data to JSON file
            return try await MainActor.run {
                guard let export = PersistenceService.shared.exportUserData() else {
                    throw GDPRError.noDataToExport
                }

                guard let jsonData = export.toJSON() else {
                    throw GDPRError.exportFailed("Failed to encode data")
                }

                // Create file in documents directory
                let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let dateFormatter = DateFormatter()
                dateFormatter.dateFormat = "yyyy-MM-dd_HHmmss"
                let timestamp = dateFormatter.string(from: Date())
                let fileName = "safebite_data_export_\(timestamp).json"
                let fileURL = documentsPath.appendingPathComponent(fileName)

                try jsonData.write(to: fileURL)

                return fileURL
            }
        },
        deleteAllData: {
            // Delete all user data
            try await MainActor.run {
                // Delete from SwiftData
                PersistenceService.shared.deleteAllData()

                // Delete auth account
                try AuthenticationService.shared.signOut()

                // Clear UserDefaults
                let domain = Bundle.main.bundleIdentifier!
                UserDefaults.standard.removePersistentDomain(forName: domain)

                // Clear keychain items (if any)
                // Note: Add keychain clearing if storing sensitive data there
            }
        },
        saveConsentSettings: { analytics, marketing, personalization in
            UserDefaults.standard.set(analytics, forKey: "gdpr_analytics_consent")
            UserDefaults.standard.set(marketing, forKey: "gdpr_marketing_consent")
            UserDefaults.standard.set(personalization, forKey: "gdpr_personalization_consent")
            UserDefaults.standard.set(true, forKey: "gdpr_consent_set")

            // TODO: Sync to Firebase when implemented
            // This would update the user's consent preferences in the backend
        },
        getConsentSettings: {
            (
                analytics: UserDefaults.standard.bool(forKey: "gdpr_analytics_consent"),
                marketing: UserDefaults.standard.bool(forKey: "gdpr_marketing_consent"),
                personalization: UserDefaults.standard.bool(forKey: "gdpr_personalization_consent")
            )
        }
    )

    static let testValue = GDPRClient(
        exportUserData: {
            let tempDir = FileManager.default.temporaryDirectory
            let fileURL = tempDir.appendingPathComponent("test_export.json")
            try "{}".write(to: fileURL, atomically: true, encoding: .utf8)
            return fileURL
        },
        deleteAllData: { },
        saveConsentSettings: { _, _, _ in },
        getConsentSettings: { (true, false, true) }
    )
}

extension DependencyValues {
    var gdprClient: GDPRClient {
        get { self[GDPRClient.self] }
        set { self[GDPRClient.self] = newValue }
    }
}

// MARK: - GDPR Errors

enum GDPRError: LocalizedError {
    case noDataToExport
    case exportFailed(String)
    case deleteFailed(String)

    var errorDescription: String? {
        switch self {
        case .noDataToExport:
            return "No data available to export. Please sign in first."
        case .exportFailed(let message):
            return "Export failed: \(message)"
        case .deleteFailed(let message):
            return "Delete failed: \(message)"
        }
    }
}
