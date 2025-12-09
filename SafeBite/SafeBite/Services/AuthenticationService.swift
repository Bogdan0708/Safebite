import Foundation
import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseFirestore

// MARK: - Authentication Service

/// Firebase Authentication service for SafeBite
/// Supports Email/Password, Apple Sign In, and Google Sign In
@MainActor
final class AuthenticationService: ObservableObject {
    static let shared = AuthenticationService()

    @Published var currentUser: AuthUser?
    @Published var isAuthenticated: Bool = false
    @Published var isLoading: Bool = false
    @Published var error: AuthError?

    private var authStateHandle: AuthStateDidChangeListenerHandle?
    private var currentNonce: String?

    private init() {
        setupAuthStateListener()
    }

    deinit {
        if let handle = authStateHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
    }

    // MARK: - Auth State Listener

    private func setupAuthStateListener() {
        authStateHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                if let firebaseUser = user {
                    self?.currentUser = AuthUser(from: firebaseUser)
                    self?.isAuthenticated = true
                } else {
                    self?.currentUser = nil
                    self?.isAuthenticated = false
                }
            }
        }
    }

    // MARK: - Email/Password Authentication

    /// Create a new account with email and password
    func signUp(email: String, password: String, displayName: String) async throws -> AuthUser {
        isLoading = true
        error = nil

        defer { isLoading = false }

        // Validate inputs
        guard isValidEmail(email) else {
            throw AuthError.invalidEmail
        }

        guard password.count >= 8 else {
            throw AuthError.weakPassword
        }

        do {
            let result = try await Auth.auth().createUser(withEmail: email, password: password)

            // Update display name
            let changeRequest = result.user.createProfileChangeRequest()
            changeRequest.displayName = displayName
            try await changeRequest.commitChanges()

            // Create user document in Firestore
            try await createUserDocument(userId: result.user.uid, email: email, displayName: displayName)

            let user = AuthUser(from: result.user)
            self.currentUser = user
            self.isAuthenticated = true
            return user
        } catch let error as NSError {
            throw mapFirebaseError(error)
        }
    }

    /// Sign in with email and password
    func signIn(email: String, password: String) async throws -> AuthUser {
        isLoading = true
        error = nil

        defer { isLoading = false }

        guard isValidEmail(email) else {
            throw AuthError.invalidEmail
        }

        do {
            let result = try await Auth.auth().signIn(withEmail: email, password: password)
            let user = AuthUser(from: result.user)
            self.currentUser = user
            self.isAuthenticated = true
            return user
        } catch let error as NSError {
            throw mapFirebaseError(error)
        }
    }

    /// Send password reset email
    func sendPasswordReset(email: String) async throws {
        isLoading = true
        error = nil

        defer { isLoading = false }

        guard isValidEmail(email) else {
            throw AuthError.invalidEmail
        }

        do {
            try await Auth.auth().sendPasswordReset(withEmail: email)
        } catch let error as NSError {
            throw mapFirebaseError(error)
        }
    }

    // MARK: - Apple Sign In

    /// Start Apple Sign In flow
    func signInWithApple() -> ASAuthorizationAppleIDRequest {
        let nonce = randomNonceString()
        currentNonce = nonce

        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        return request
    }

    /// Complete Apple Sign In with authorization
    func handleAppleSignIn(authorization: ASAuthorization) async throws -> AuthUser {
        isLoading = true
        error = nil

        defer { isLoading = false }

        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            throw AuthError.invalidCredential
        }

        guard let nonce = currentNonce else {
            throw AuthError.invalidCredential
        }

        guard let appleIDToken = appleIDCredential.identityToken,
              let idTokenString = String(data: appleIDToken, encoding: .utf8) else {
            throw AuthError.invalidCredential
        }

        let credential = OAuthProvider.appleCredential(
            withIDToken: idTokenString,
            rawNonce: nonce,
            fullName: appleIDCredential.fullName
        )

        do {
            let result = try await Auth.auth().signIn(with: credential)

            // Update display name if provided
            if let fullName = appleIDCredential.fullName,
               let givenName = fullName.givenName {
                let changeRequest = result.user.createProfileChangeRequest()
                changeRequest.displayName = [givenName, fullName.familyName].compactMap { $0 }.joined(separator: " ")
                try await changeRequest.commitChanges()
            }

            // Create user document if this is a new user
            let userDoc = try await Firestore.firestore().collection("users").document(result.user.uid).getDocument()
            if !userDoc.exists {
                let displayName = appleIDCredential.fullName.map {
                    [$0.givenName, $0.familyName].compactMap { $0 }.joined(separator: " ")
                } ?? "User"
                try await createUserDocument(
                    userId: result.user.uid,
                    email: result.user.email ?? "",
                    displayName: displayName
                )
            }

            let user = AuthUser(from: result.user)
            self.currentUser = user
            self.isAuthenticated = true
            return user
        } catch let error as NSError {
            throw mapFirebaseError(error)
        }
    }

    // MARK: - Sign Out

    /// Sign out the current user
    func signOut() throws {
        do {
            try Auth.auth().signOut()
            self.currentUser = nil
            self.isAuthenticated = false
        } catch {
            throw AuthError.signOutFailed
        }
    }

    // MARK: - Account Management

    /// Delete user account and all associated data
    func deleteAccount() async throws {
        isLoading = true
        error = nil

        defer { isLoading = false }

        guard let firebaseUser = Auth.auth().currentUser else {
            throw AuthError.notAuthenticated
        }

        do {
            // Delete user data from Firestore first
            try await deleteUserData(userId: firebaseUser.uid)

            // Delete local SwiftData
            PersistenceService.shared.deleteAllData()

            // Then delete the auth account
            try await firebaseUser.delete()

            self.currentUser = nil
            self.isAuthenticated = false
        } catch let error as NSError {
            throw mapFirebaseError(error)
        }
    }

    /// Update user display name
    func updateDisplayName(_ name: String) async throws {
        guard let firebaseUser = Auth.auth().currentUser else {
            throw AuthError.notAuthenticated
        }

        let changeRequest = firebaseUser.createProfileChangeRequest()
        changeRequest.displayName = name
        try await changeRequest.commitChanges()

        // Update Firestore
        try await Firestore.firestore().collection("users").document(firebaseUser.uid).updateData([
            "displayName": name
        ])

        // Update local state
        self.currentUser = AuthUser(from: firebaseUser)
    }

    /// Re-authenticate user (required before sensitive operations)
    func reauthenticate(password: String) async throws {
        guard let email = Auth.auth().currentUser?.email else {
            throw AuthError.notAuthenticated
        }

        let credential = EmailAuthProvider.credential(withEmail: email, password: password)
        try await Auth.auth().currentUser?.reauthenticate(with: credential)
    }

    // MARK: - Helper Methods

    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        if errorCode != errSecSuccess {
            fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
        }

        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        let nonce = randomBytes.map { byte in
            charset[Int(byte) % charset.count]
        }

        return String(nonce)
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.compactMap { String(format: "%02x", $0) }.joined()
    }

    private func mapFirebaseError(_ error: NSError) -> AuthError {
        switch error.code {
        case AuthErrorCode.invalidEmail.rawValue:
            return .invalidEmail
        case AuthErrorCode.wrongPassword.rawValue:
            return .wrongPassword
        case AuthErrorCode.userNotFound.rawValue:
            return .userNotFound
        case AuthErrorCode.emailAlreadyInUse.rawValue:
            return .emailAlreadyInUse
        case AuthErrorCode.weakPassword.rawValue:
            return .weakPassword
        case AuthErrorCode.networkError.rawValue:
            return .networkError
        case AuthErrorCode.requiresRecentLogin.rawValue:
            return .requiresReauthentication
        default:
            return .unknown(error.localizedDescription)
        }
    }

    private func createUserDocument(userId: String, email: String, displayName: String) async throws {
        let db = Firestore.firestore()
        try await db.collection("users").document(userId).setData([
            "email": email,
            "displayName": displayName,
            "createdAt": FieldValue.serverTimestamp(),
            "severityLevel": "coeliac",
            "isPremium": false,
            "reviewCount": 0,
            "isVerifiedReviewer": false,
            "gdprConsentGiven": true,
            "gdprConsentDate": FieldValue.serverTimestamp()
        ])
    }

    private func deleteUserData(userId: String) async throws {
        let db = Firestore.firestore()

        // Delete user document
        try await db.collection("users").document(userId).delete()

        // Delete user's reviews
        let reviewsQuery = db.collection("reviews").whereField("userId", isEqualTo: userId)
        let reviewsSnapshot = try await reviewsQuery.getDocuments()
        for doc in reviewsSnapshot.documents {
            try await doc.reference.delete()
        }

        // Delete user's saved restaurants
        let savedQuery = db.collection("savedRestaurants").whereField("userId", isEqualTo: userId)
        let savedSnapshot = try await savedQuery.getDocuments()
        for doc in savedSnapshot.documents {
            try await doc.reference.delete()
        }

        // Delete user's incident reports
        let incidentsQuery = db.collection("incidents").whereField("userId", isEqualTo: userId)
        let incidentsSnapshot = try await incidentsQuery.getDocuments()
        for doc in incidentsSnapshot.documents {
            try await doc.reference.delete()
        }
    }
}

// MARK: - Auth User Model

struct AuthUser: Codable, Equatable, Identifiable {
    let id: String
    let email: String
    let displayName: String
    let photoURL: String?
    let isEmailVerified: Bool
    let createdAt: Date

    init(id: String, email: String, displayName: String, photoURL: String?, isEmailVerified: Bool, createdAt: Date) {
        self.id = id
        self.email = email
        self.displayName = displayName
        self.photoURL = photoURL
        self.isEmailVerified = isEmailVerified
        self.createdAt = createdAt
    }

    init(from firebaseUser: FirebaseAuth.User) {
        self.id = firebaseUser.uid
        self.email = firebaseUser.email ?? ""
        self.displayName = firebaseUser.displayName ?? ""
        self.photoURL = firebaseUser.photoURL?.absoluteString
        self.isEmailVerified = firebaseUser.isEmailVerified
        self.createdAt = firebaseUser.metadata.creationDate ?? Date()
    }
}

// MARK: - Auth Errors

enum AuthError: LocalizedError {
    case invalidEmail
    case wrongPassword
    case userNotFound
    case emailAlreadyInUse
    case weakPassword
    case networkError
    case invalidCredential
    case notAuthenticated
    case requiresReauthentication
    case signOutFailed
    case unknown(String)

    var errorDescription: String? {
        switch self {
        case .invalidEmail:
            return "Please enter a valid email address."
        case .wrongPassword:
            return "The password is incorrect. Please try again."
        case .userNotFound:
            return "No account found with this email address."
        case .emailAlreadyInUse:
            return "An account with this email already exists."
        case .weakPassword:
            return "Password must be at least 8 characters long."
        case .networkError:
            return "Network error. Please check your connection."
        case .invalidCredential:
            return "Invalid credentials. Please try again."
        case .notAuthenticated:
            return "You must be signed in to perform this action."
        case .requiresReauthentication:
            return "Please sign in again to continue."
        case .signOutFailed:
            return "Failed to sign out. Please try again."
        case .unknown(let message):
            return message
        }
    }
}
