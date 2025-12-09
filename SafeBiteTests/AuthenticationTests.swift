import XCTest
@testable import SafeBite

final class AuthenticationTests: XCTestCase {

    // MARK: - AuthUser Tests

    func test_AuthUser_initialization() {
        let user = AuthUser(
            id: "test-id",
            email: "test@example.com",
            displayName: "Test User",
            photoURL: "https://example.com/photo.jpg",
            isEmailVerified: true,
            createdAt: Date()
        )

        XCTAssertEqual(user.id, "test-id")
        XCTAssertEqual(user.email, "test@example.com")
        XCTAssertEqual(user.displayName, "Test User")
        XCTAssertEqual(user.photoURL, "https://example.com/photo.jpg")
        XCTAssertTrue(user.isEmailVerified)
    }

    func test_AuthUser_encodeDecode() throws {
        let original = AuthUser(
            id: "test-id",
            email: "test@example.com",
            displayName: "Test User",
            photoURL: nil,
            isEmailVerified: false,
            createdAt: Date()
        )

        let encoder = JSONEncoder()
        let data = try encoder.encode(original)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(AuthUser.self, from: data)

        XCTAssertEqual(original.id, decoded.id)
        XCTAssertEqual(original.email, decoded.email)
        XCTAssertEqual(original.displayName, decoded.displayName)
        XCTAssertEqual(original.photoURL, decoded.photoURL)
        XCTAssertEqual(original.isEmailVerified, decoded.isEmailVerified)
    }

    func test_AuthUser_equality() {
        let user1 = AuthUser(
            id: "test-id",
            email: "test@example.com",
            displayName: "Test User",
            photoURL: nil,
            isEmailVerified: true,
            createdAt: Date()
        )

        let user2 = AuthUser(
            id: "test-id",
            email: "test@example.com",
            displayName: "Test User",
            photoURL: nil,
            isEmailVerified: true,
            createdAt: Date()
        )

        let user3 = AuthUser(
            id: "different-id",
            email: "test@example.com",
            displayName: "Test User",
            photoURL: nil,
            isEmailVerified: true,
            createdAt: Date()
        )

        XCTAssertEqual(user1, user2)
        XCTAssertNotEqual(user1, user3)
    }

    // MARK: - AuthError Tests

    func test_AuthError_descriptions() {
        XCTAssertEqual(
            AuthError.invalidEmail.errorDescription,
            "Please enter a valid email address."
        )

        XCTAssertEqual(
            AuthError.wrongPassword.errorDescription,
            "The password is incorrect. Please try again."
        )

        XCTAssertEqual(
            AuthError.userNotFound.errorDescription,
            "No account found with this email address."
        )

        XCTAssertEqual(
            AuthError.emailAlreadyInUse.errorDescription,
            "An account with this email already exists."
        )

        XCTAssertEqual(
            AuthError.weakPassword.errorDescription,
            "Password must be at least 8 characters long."
        )

        XCTAssertEqual(
            AuthError.networkError.errorDescription,
            "Network error. Please check your connection."
        )

        XCTAssertEqual(
            AuthError.invalidCredential.errorDescription,
            "Invalid credentials. Please try again."
        )

        XCTAssertEqual(
            AuthError.notAuthenticated.errorDescription,
            "You must be signed in to perform this action."
        )

        XCTAssertEqual(
            AuthError.requiresReauthentication.errorDescription,
            "Please sign in again to continue."
        )

        XCTAssertEqual(
            AuthError.signOutFailed.errorDescription,
            "Failed to sign out. Please try again."
        )

        XCTAssertEqual(
            AuthError.unknown("Custom error").errorDescription,
            "Custom error"
        )
    }

    // MARK: - Email Validation Tests (through AuthError context)

    func test_emailValidation_validEmails() {
        // Test emails that should pass validation
        let validEmails = [
            "test@example.com",
            "user.name@domain.co.uk",
            "user+tag@example.org",
            "a@b.cd"
        ]

        for email in validEmails {
            let isValid = isValidEmail(email)
            XCTAssertTrue(isValid, "Email '\(email)' should be valid")
        }
    }

    func test_emailValidation_invalidEmails() {
        let invalidEmails = [
            "",
            "not-an-email",
            "@domain.com",
            "user@",
            "user@.com",
            "user@domain"
        ]

        for email in invalidEmails {
            let isValid = isValidEmail(email)
            XCTAssertFalse(isValid, "Email '\(email)' should be invalid")
        }
    }

    // Helper function to match AuthenticationService validation
    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }
}
