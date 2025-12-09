import Foundation
import ComposableArchitecture
import AuthenticationServices

/// Authentication feature for sign in/sign up flows
@Reducer
struct AuthFeature {
    @ObservableState
    struct State: Equatable {
        var mode: AuthMode = .signIn
        var email: String = ""
        var password: String = ""
        var confirmPassword: String = ""
        var displayName: String = ""

        var isLoading: Bool = false
        var errorMessage: String?
        var showForgotPassword: Bool = false
        var forgotPasswordEmail: String = ""
        var forgotPasswordSent: Bool = false

        var isFormValid: Bool {
            switch mode {
            case .signIn:
                return !email.isEmpty && !password.isEmpty
            case .signUp:
                return !email.isEmpty && !password.isEmpty &&
                       password == confirmPassword && !displayName.isEmpty &&
                       password.count >= 8
            }
        }

        var passwordError: String? {
            guard mode == .signUp && !password.isEmpty else { return nil }
            if password.count < 8 {
                return "Password must be at least 8 characters"
            }
            if !confirmPassword.isEmpty && password != confirmPassword {
                return "Passwords do not match"
            }
            return nil
        }
    }

    enum AuthMode: Equatable {
        case signIn
        case signUp
    }

    enum Action: Equatable {
        case modeToggled
        case emailChanged(String)
        case passwordChanged(String)
        case confirmPasswordChanged(String)
        case displayNameChanged(String)

        case submitTapped
        case signInCompleted(AuthUser)
        case signUpCompleted(AuthUser)
        case authFailed(String)

        case appleSignInTapped
        case appleSignInCompleted(AuthUser)

        case forgotPasswordTapped
        case forgotPasswordEmailChanged(String)
        case sendResetEmailTapped
        case resetEmailSent
        case dismissForgotPassword

        case clearError
    }

    @Dependency(\.authClient) var authClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .modeToggled:
                state.mode = state.mode == .signIn ? .signUp : .signIn
                state.errorMessage = nil
                state.password = ""
                state.confirmPassword = ""
                return .none

            case .emailChanged(let email):
                state.email = email
                state.errorMessage = nil
                return .none

            case .passwordChanged(let password):
                state.password = password
                state.errorMessage = nil
                return .none

            case .confirmPasswordChanged(let password):
                state.confirmPassword = password
                return .none

            case .displayNameChanged(let name):
                state.displayName = name
                return .none

            case .submitTapped:
                guard state.isFormValid else { return .none }

                state.isLoading = true
                state.errorMessage = nil

                let email = state.email
                let password = state.password
                let displayName = state.displayName
                let mode = state.mode

                return .run { send in
                    do {
                        if mode == .signIn {
                            let user = try await authClient.signIn(email, password)
                            await send(.signInCompleted(user))
                        } else {
                            let user = try await authClient.signUp(email, password, displayName)
                            await send(.signUpCompleted(user))
                        }
                    } catch {
                        await send(.authFailed(error.localizedDescription))
                    }
                }

            case .signInCompleted:
                state.isLoading = false
                return .none

            case .signUpCompleted:
                state.isLoading = false
                return .none

            case .authFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .appleSignInTapped:
                state.isLoading = true
                state.errorMessage = nil
                return .none

            case .appleSignInCompleted:
                state.isLoading = false
                return .none

            case .forgotPasswordTapped:
                state.showForgotPassword = true
                state.forgotPasswordEmail = state.email
                state.forgotPasswordSent = false
                return .none

            case .forgotPasswordEmailChanged(let email):
                state.forgotPasswordEmail = email
                return .none

            case .sendResetEmailTapped:
                let email = state.forgotPasswordEmail
                return .run { send in
                    do {
                        try await authClient.sendPasswordReset(email)
                        await send(.resetEmailSent)
                    } catch {
                        await send(.authFailed(error.localizedDescription))
                    }
                }

            case .resetEmailSent:
                state.forgotPasswordSent = true
                return .none

            case .dismissForgotPassword:
                state.showForgotPassword = false
                return .none

            case .clearError:
                state.errorMessage = nil
                return .none
            }
        }
    }
}

// MARK: - Auth Client Dependency

struct AuthClient {
    var signIn: @Sendable (String, String) async throws -> AuthUser
    var signUp: @Sendable (String, String, String) async throws -> AuthUser
    var signOut: @Sendable () throws -> Void
    var sendPasswordReset: @Sendable (String) async throws -> Void
    var deleteAccount: @Sendable () async throws -> Void
    var currentUser: @Sendable () -> AuthUser?
    var isAuthenticated: @Sendable () -> Bool
}

extension AuthClient: DependencyKey {
    static let liveValue = AuthClient(
        signIn: { email, password in
            try await AuthenticationService.shared.signIn(email: email, password: password)
        },
        signUp: { email, password, displayName in
            try await AuthenticationService.shared.signUp(email: email, password: password, displayName: displayName)
        },
        signOut: {
            try AuthenticationService.shared.signOut()
        },
        sendPasswordReset: { email in
            try await AuthenticationService.shared.sendPasswordReset(email: email)
        },
        deleteAccount: {
            try await AuthenticationService.shared.deleteAccount()
        },
        currentUser: {
            AuthenticationService.shared.currentUser
        },
        isAuthenticated: {
            AuthenticationService.shared.isAuthenticated
        }
    )

    static let testValue = AuthClient(
        signIn: { email, _ in
            AuthUser(
                id: "test-user",
                email: email,
                displayName: "Test User",
                photoURL: nil,
                isEmailVerified: true,
                createdAt: Date()
            )
        },
        signUp: { email, _, displayName in
            AuthUser(
                id: "test-user",
                email: email,
                displayName: displayName,
                photoURL: nil,
                isEmailVerified: false,
                createdAt: Date()
            )
        },
        signOut: { },
        sendPasswordReset: { _ in },
        deleteAccount: { },
        currentUser: { nil },
        isAuthenticated: { false }
    )
}

extension DependencyValues {
    var authClient: AuthClient {
        get { self[AuthClient.self] }
        set { self[AuthClient.self] = newValue }
    }
}
