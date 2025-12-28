import Foundation

/// Centralized error type for SafeBite app
enum AppError: LocalizedError {
    // Network errors
    case networkUnavailable
    case timeout
    case serverError(Int)

    // Authentication errors
    case notAuthenticated
    case invalidCredentials
    case accountNotFound
    case emailAlreadyInUse
    case weakPassword
    case sessionExpired

    // Data errors
    case dataNotFound
    case invalidData
    case saveFailed
    case deleteFailed
    case syncFailed

    // Permission errors
    case permissionDenied
    case locationDenied
    case cameraNotAvailable

    // Subscription errors
    case productNotFound
    case purchaseFailed
    case purchaseCancelled
    case receiptValidationFailed

    // API errors
    case apiKeyMissing
    case rateLimitExceeded
    case quotaExceeded

    // General errors
    case unknown(String)

    var errorDescription: String? {
        switch self {
        // Network
        case .networkUnavailable:
            return NSLocalizedString("error_network_unavailable", comment: "No internet connection. Please check your network settings.")
        case .timeout:
            return NSLocalizedString("error_timeout", comment: "The request timed out. Please try again.")
        case .serverError(let code):
            return String(format: NSLocalizedString("error_server", comment: "Server error (%d). Please try again later."), code)

        // Auth
        case .notAuthenticated:
            return NSLocalizedString("error_not_authenticated", comment: "You must be signed in to perform this action.")
        case .invalidCredentials:
            return NSLocalizedString("error_invalid_credentials", comment: "Invalid email or password.")
        case .accountNotFound:
            return NSLocalizedString("error_account_not_found", comment: "No account found with this email.")
        case .emailAlreadyInUse:
            return NSLocalizedString("error_email_in_use", comment: "This email is already registered.")
        case .weakPassword:
            return NSLocalizedString("error_weak_password", comment: "Password must be at least 8 characters.")
        case .sessionExpired:
            return NSLocalizedString("error_session_expired", comment: "Your session has expired. Please sign in again.")

        // Data
        case .dataNotFound:
            return NSLocalizedString("error_data_not_found", comment: "The requested data was not found.")
        case .invalidData:
            return NSLocalizedString("error_invalid_data", comment: "The data format is invalid.")
        case .saveFailed:
            return NSLocalizedString("error_save_failed", comment: "Failed to save data. Please try again.")
        case .deleteFailed:
            return NSLocalizedString("error_delete_failed", comment: "Failed to delete data. Please try again.")
        case .syncFailed:
            return NSLocalizedString("error_sync_failed", comment: "Failed to sync data. Please try again.")

        // Permissions
        case .permissionDenied:
            return NSLocalizedString("error_permission_denied", comment: "You don't have permission to perform this action.")
        case .locationDenied:
            return NSLocalizedString("error_location_denied", comment: "Location access is required. Please enable it in Settings.")
        case .cameraNotAvailable:
            return NSLocalizedString("error_camera_unavailable", comment: "Camera is not available on this device.")

        // Subscription
        case .productNotFound:
            return NSLocalizedString("error_product_not_found", comment: "Subscription product not found.")
        case .purchaseFailed:
            return NSLocalizedString("error_purchase_failed", comment: "Purchase failed. Please try again.")
        case .purchaseCancelled:
            return NSLocalizedString("error_purchase_cancelled", comment: "Purchase was cancelled.")
        case .receiptValidationFailed:
            return NSLocalizedString("error_receipt_validation", comment: "Unable to validate purchase receipt.")

        // API
        case .apiKeyMissing:
            return NSLocalizedString("error_api_key_missing", comment: "API configuration error. Please contact support.")
        case .rateLimitExceeded:
            return NSLocalizedString("error_rate_limit", comment: "Too many requests. Please wait and try again.")
        case .quotaExceeded:
            return NSLocalizedString("error_quota_exceeded", comment: "Service quota exceeded. Please try again later.")

        // General
        case .unknown:
            return NSLocalizedString("error_unknown", comment: "An unexpected error occurred.")
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .networkUnavailable:
            return NSLocalizedString("recovery_network", comment: "Check your Wi-Fi or mobile data connection.")
        case .notAuthenticated, .sessionExpired:
            return NSLocalizedString("recovery_sign_in", comment: "Sign in to continue.")
        case .locationDenied:
            return NSLocalizedString("recovery_location", comment: "Go to Settings > SafeBite > Location to enable location access.")
        case .purchaseFailed, .purchaseCancelled:
            return NSLocalizedString("recovery_purchase", comment: "You can try again or contact Apple Support if the issue persists.")
        case .timeout, .serverError(_):
            return NSLocalizedString("recovery_retry", comment: "Please wait a moment and try again.")
        case .syncFailed, .saveFailed:
            return NSLocalizedString("recovery_sync", comment: "Check your connection and try again.")
        default:
            return nil
        }
    }

    var isRetryable: Bool {
        switch self {
        case .networkUnavailable, .timeout, .serverError(_), .syncFailed, .saveFailed:
            return true
        default:
            return false
        }
    }

    /// Debug description for logging (not shown to users)
    var debugDescription: String {
        switch self {
        case .unknown(let message):
            return "Unknown error: \(message)"
        case .serverError(let code):
            return "Server error with code: \(code)"
        default:
            return String(describing: self)
        }
    }
}

// MARK: - Firebase Auth Error Codes

/// Self-documenting Firebase Auth error codes
/// Reference: https://firebase.google.com/docs/auth/admin/errors
private enum FirebaseAuthErrorCode: Int {
    case wrongPassword = 17009
    case userNotFound = 17011
    case emailAlreadyInUse = 17007
    case weakPassword = 17026
    case networkError = 17020
    case userDisabled = 17005
    case invalidEmail = 17008
    case operationNotAllowed = 17006
    case tooManyRequests = 17010
    case requiresRecentLogin = 17014
}

// MARK: - Firestore Error Codes

/// Self-documenting Firestore error codes
/// Reference: https://firebase.google.com/docs/firestore/troubleshoot
private enum FirestoreErrorCode: Int {
    case cancelled = 1
    case unknown = 2
    case invalidArgument = 3
    case deadlineExceeded = 4
    case notFound = 5
    case alreadyExists = 6
    case permissionDenied = 7
    case resourceExhausted = 8
    case failedPrecondition = 9
    case aborted = 10
    case outOfRange = 11
    case unimplemented = 12
    case `internal` = 13
    case unavailable = 14
    case dataLoss = 15
    case unauthenticated = 16
}

// MARK: - Error Mapping Extensions

extension AppError {
    /// Map Firebase Auth errors to AppError
    static func from(authError: Error) -> AppError {
        let nsError = authError as NSError

        guard let code = FirebaseAuthErrorCode(rawValue: nsError.code) else {
            return .unknown(authError.localizedDescription)
        }

        switch code {
        case .wrongPassword:
            return .invalidCredentials
        case .userNotFound:
            return .accountNotFound
        case .emailAlreadyInUse:
            return .emailAlreadyInUse
        case .weakPassword:
            return .weakPassword
        case .networkError:
            return .networkUnavailable
        case .userDisabled:
            return .permissionDenied
        case .invalidEmail:
            return .invalidCredentials
        case .operationNotAllowed:
            return .permissionDenied
        case .tooManyRequests:
            return .rateLimitExceeded
        case .requiresRecentLogin:
            return .sessionExpired
        }
    }

    /// Map Firestore errors to AppError
    static func from(firestoreError: Error) -> AppError {
        let nsError = firestoreError as NSError

        guard let code = FirestoreErrorCode(rawValue: nsError.code) else {
            return .unknown(firestoreError.localizedDescription)
        }

        switch code {
        case .permissionDenied:
            return .permissionDenied
        case .notFound:
            return .dataNotFound
        case .unavailable:
            return .networkUnavailable
        case .resourceExhausted:
            return .quotaExceeded
        case .unauthenticated:
            return .notAuthenticated
        case .deadlineExceeded:
            return .timeout
        case .cancelled:
            return .unknown(NSLocalizedString("error_cancelled", comment: "Operation was cancelled."))
        case .alreadyExists:
            return .invalidData
        case .invalidArgument, .failedPrecondition, .outOfRange:
            return .invalidData
        case .aborted:
            return .syncFailed
        case .dataLoss:
            return .saveFailed
        case .unknown, .unimplemented, .internal:
            return .unknown(firestoreError.localizedDescription)
        }
    }

    /// Map network errors to AppError
    static func from(networkError: Error) -> AppError {
        let nsError = networkError as NSError

        switch nsError.code {
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
            return .networkUnavailable
        case NSURLErrorTimedOut:
            return .timeout
        case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost:
            return .serverError(nsError.code)
        default:
            return .unknown(networkError.localizedDescription)
        }
    }
}

// MARK: - Error Presentation Helper

struct ErrorPresenter {
    /// Create a user-friendly alert message from an AppError
    static func alertMessage(for error: AppError) -> (title: String, message: String) {
        let title: String

        switch error {
        case .networkUnavailable, .timeout, .serverError(_):
            title = NSLocalizedString("error_title_connection", comment: "Connection Error")
        case .notAuthenticated, .invalidCredentials, .accountNotFound, .emailAlreadyInUse, .weakPassword, .sessionExpired:
            title = NSLocalizedString("error_title_auth", comment: "Sign In Error")
        case .dataNotFound, .invalidData, .saveFailed, .deleteFailed, .syncFailed:
            title = NSLocalizedString("error_title_data", comment: "Data Error")
        case .permissionDenied, .locationDenied, .cameraNotAvailable:
            title = NSLocalizedString("error_title_permission", comment: "Permission Required")
        case .productNotFound, .purchaseFailed, .purchaseCancelled, .receiptValidationFailed:
            title = NSLocalizedString("error_title_purchase", comment: "Purchase Error")
        case .apiKeyMissing, .rateLimitExceeded, .quotaExceeded:
            title = NSLocalizedString("error_title_service", comment: "Service Error")
        case .unknown:
            title = NSLocalizedString("error_title_generic", comment: "Error")
        }

        var message = error.errorDescription ?? NSLocalizedString("error_unknown", comment: "An unexpected error occurred.")
        if let suggestion = error.recoverySuggestion {
            message += "\n\n" + suggestion
        }

        return (title, message)
    }
}
