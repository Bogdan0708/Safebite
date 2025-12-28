import Foundation
import ComposableArchitecture

/// Profile feature for user settings and account management
@Reducer
struct ProfileFeature {
    @ObservableState
    struct State: Equatable {
        var user: UserProfile?
        var isLoading: Bool = false
        var isLoggedIn: Bool = false

        // Settings
        var notificationsEnabled: Bool = true
        var locationEnabled: Bool = false
        var selectedLanguage: Language = .english
        var selectedCurrency: Currency = .eur

        // Subscription
        var subscriptionTier: SubscriptionTier = .free
        var subscriptionExpiresAt: Date?

        // Stats
        var reviewCount: Int = 0
        var savedRestaurantsCount: Int = 0
        var helpfulVotesCount: Int = 0

        // Sheets
        var showSignIn: Bool = false
        var showLanguagePicker: Bool = false
        var showCurrencyPicker: Bool = false
        var showSeverityPicker: Bool = false
        var showPremiumPaywall: Bool = false
        var showDeleteAccountConfirmation: Bool = false
        var showSignOutConfirmation: Bool = false

        // Error handling
        var errorMessage: String?
    }

    enum Action: Equatable {
        case onAppear
        case userLoaded(UserProfile?)
        case loadUserProfile

        // Auth
        case signInTapped
        case dismissSignIn
        case signInCompleted(AuthUser)
        case signOutTapped
        case signOutConfirmed
        case signOutCompleted
        case signOutFailed(String)
        case deleteAccountTapped
        case deleteAccountConfirmed
        case deleteAccountCompleted
        case deleteAccountFailed(String)

        // Settings
        case notificationsToggled
        case locationToggled
        case languageSelected(Language)
        case currencySelected(Currency)
        case severityLevelSelected(GlutenSeverityLevel)

        // Sheets
        case toggleLanguagePicker
        case toggleCurrencyPicker
        case toggleSeverityPicker
        case togglePremiumPaywall
        case toggleDeleteAccountConfirmation
        case toggleSignOutConfirmation

        // Premium
        case upgradeToPremium
        case purchaseCompleted(SubscriptionTier)
        case purchaseFailed(String)
        case restorePurchases
        case restoreCompleted(SubscriptionTier)
        case restoreFailed(String)

        // GDPR
        case exportDataTapped
        case dataExported(URL)
        case exportFailed(String)
        case privacyPolicyTapped

        // Error
        case clearError
    }

    @Dependency(\.authClient) var authClient
    @Dependency(\.subscriptionClient) var subscriptionClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                return .send(.loadUserProfile)

            case .loadUserProfile:
                if let authUser = authClient.currentUser() {
                    let profile = UserProfile(
                        id: authUser.id,
                        email: authUser.email,
                        displayName: authUser.displayName,
                        severityLevel: .coeliac,
                        notificationsEnabled: state.notificationsEnabled,
                        preferredLanguage: state.selectedLanguage,
                        preferredCurrency: state.selectedCurrency,
                        reviewCount: state.reviewCount,
                        subscriptionTier: state.subscriptionTier
                    )
                    return .send(.userLoaded(profile))
                } else {
                    return .send(.userLoaded(nil))
                }

            case .userLoaded(let user):
                state.user = user
                state.isLoggedIn = user != nil
                if let user = user {
                    state.notificationsEnabled = user.notificationsEnabled
                    state.selectedLanguage = user.preferredLanguage
                    state.selectedCurrency = user.preferredCurrency
                    state.reviewCount = user.reviewCount
                    state.subscriptionTier = user.subscriptionTier
                }
                return .none

            case .signInTapped:
                state.showSignIn = true
                return .none

            case .dismissSignIn:
                state.showSignIn = false
                return .none

            case .signInCompleted(let authUser):
                state.showSignIn = false
                let profile = UserProfile(
                    id: authUser.id,
                    email: authUser.email,
                    displayName: authUser.displayName,
                    severityLevel: .coeliac,
                    notificationsEnabled: state.notificationsEnabled,
                    preferredLanguage: state.selectedLanguage,
                    preferredCurrency: state.selectedCurrency,
                    reviewCount: 0,
                    subscriptionTier: .free
                )
                state.user = profile
                state.isLoggedIn = true
                return .none

            case .signOutTapped:
                state.showSignOutConfirmation = true
                return .none

            case .signOutConfirmed:
                state.showSignOutConfirmation = false
                state.isLoading = true

                return .run { send in
                    do {
                        try authClient.signOut()
                        await send(.signOutCompleted)
                    } catch {
                        await send(.signOutFailed(error.localizedDescription))
                    }
                }

            case .signOutCompleted:
                state.isLoading = false
                state.isLoggedIn = false
                state.user = nil
                return .none

            case .signOutFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .deleteAccountTapped:
                state.showDeleteAccountConfirmation = true
                return .none

            case .deleteAccountConfirmed:
                state.showDeleteAccountConfirmation = false
                state.isLoading = true

                return .run { send in
                    do {
                        try await authClient.deleteAccount()
                        await send(.deleteAccountCompleted)
                    } catch {
                        await send(.deleteAccountFailed(error.localizedDescription))
                    }
                }

            case .deleteAccountCompleted:
                state.isLoading = false
                state.isLoggedIn = false
                state.user = nil
                return .none

            case .deleteAccountFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .notificationsToggled:
                state.notificationsEnabled.toggle()
                // Save to UserDefaults
                UserDefaults.standard.set(state.notificationsEnabled, forKey: "notificationsEnabled")
                return .none

            case .locationToggled:
                state.locationEnabled.toggle()
                return .none

            case .languageSelected(let language):
                state.selectedLanguage = language
                state.showLanguagePicker = false
                UserDefaults.standard.set(language.rawValue, forKey: "selectedLanguage")
                return .none

            case .currencySelected(let currency):
                state.selectedCurrency = currency
                state.showCurrencyPicker = false
                UserDefaults.standard.set(currency.rawValue, forKey: "selectedCurrency")
                return .none

            case .severityLevelSelected(let severity):
                state.user?.severityLevel = severity
                state.showSeverityPicker = false
                return .none

            case .toggleLanguagePicker:
                state.showLanguagePicker.toggle()
                return .none

            case .toggleCurrencyPicker:
                state.showCurrencyPicker.toggle()
                return .none

            case .toggleSeverityPicker:
                state.showSeverityPicker.toggle()
                return .none

            case .togglePremiumPaywall:
                state.showPremiumPaywall.toggle()
                return .none

            case .toggleDeleteAccountConfirmation:
                state.showDeleteAccountConfirmation.toggle()
                return .none

            case .toggleSignOutConfirmation:
                state.showSignOutConfirmation.toggle()
                return .none

            case .upgradeToPremium:
                state.showPremiumPaywall = true
                return .none

            case .purchaseCompleted(let tier):
                state.subscriptionTier = tier
                state.user?.subscriptionTier = tier
                state.showPremiumPaywall = false
                // Persist to user profile
                return .run { _ in
                    await MainActor.run {
                        if let user = PersistenceService.shared.fetchCurrentUser() {
                            user.subscriptionTier = tier
                            user.subscriptionExpiresAt = Calendar.current.date(
                                byAdding: tier == .premiumMonthly ? .month : .year,
                                value: 1,
                                to: Date()
                            )
                            PersistenceService.shared.saveUser(user)
                        }
                    }
                }

            case .purchaseFailed(let message):
                state.errorMessage = message
                state.showPremiumPaywall = false
                return .none

            case .restorePurchases:
                state.isLoading = true
                return .run { send in
                    do {
                        let tier = try await subscriptionClient.restorePurchases()
                        await send(.restoreCompleted(tier))
                    } catch {
                        await send(.restoreFailed(error.localizedDescription))
                    }
                }

            case .restoreCompleted(let tier):
                state.isLoading = false
                state.subscriptionTier = tier
                state.user?.subscriptionTier = tier
                if tier.isPremium {
                    state.subscriptionExpiresAt = Calendar.current.date(
                        byAdding: tier == .premiumMonthly ? .month : .year,
                        value: 1,
                        to: Date()
                    )
                }
                return .none

            case .restoreFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .exportDataTapped:
                state.isLoading = true

                return .run { send in
                    await MainActor.run {
                        if let export = PersistenceService.shared.exportUserData(),
                           let jsonData = export.toJSON() {
                            // Save to temporary file
                            let tempDir = FileManager.default.temporaryDirectory
                            let fileURL = tempDir.appendingPathComponent("safebite_data_export.json")

                            do {
                                try jsonData.write(to: fileURL)
                                Task { await send(.dataExported(fileURL)) }
                            } catch {
                                Task { await send(.exportFailed(error.localizedDescription)) }
                            }
                        } else {
                            Task { await send(.exportFailed("No data to export")) }
                        }
                    }
                }

            case .dataExported:
                state.isLoading = false
                return .none

            case .exportFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .privacyPolicyTapped:
                // Open privacy policy URL
                if let url = URL(string: "https://safebite.app/privacy") {
                    // URL opening handled by view
                    _ = url
                }
                return .none

            case .clearError:
                state.errorMessage = nil
                return .none
            }
        }
    }
}

// MARK: - User Profile (Simplified for State)

struct UserProfile: Equatable {
    var id: String
    var email: String
    var displayName: String
    var severityLevel: GlutenSeverityLevel
    var notificationsEnabled: Bool
    var preferredLanguage: Language
    var preferredCurrency: Currency
    var reviewCount: Int
    var subscriptionTier: SubscriptionTier
}
