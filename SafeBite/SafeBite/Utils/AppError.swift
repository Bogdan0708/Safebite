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
        case .unknown(let message):
            return message
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .networkUnavailable:
            return "Check your Wi-Fi or mobile data connection."
        case .notAuthenticated, .sessionExpired:
            return "Sign in to continue."
        case .locationDenied:
            return "Go to Settings > SafeBite > Location to enable location access."
        case .purchaseFailed, .purchaseCancelled:
            return "You can try again or contact Apple Support if the issue persists."
        default:
            return nil
        }
    }

    var isRetryable: Bool {
        switch self {
        case .networkUnavailable, .timeout, .serverError, .syncFailed, .saveFailed:
            return true
        default:
            return false
        }
    }
}

// MARK: - Error Mapping Extensions

extension AppError {
    /// Map Firebase Auth errors to AppError
    static func from(authError: Error) -> AppError {
        let nsError = authError as NSError

        // Firebase Auth error codes
        switch nsError.code {
        case 17009: return .invalidCredentials // wrongPassword
        case 17011: return .accountNotFound // userNotFound
        case 17007: return .emailAlreadyInUse
        case 17026: return .weakPassword
        case 17020: return .networkUnavailable
        case 17005: return .permissionDenied // userDisabled
        default: return .unknown(authError.localizedDescription)
        }
    }

    /// Map Firestore errors to AppError
    static func from(firestoreError: Error) -> AppError {
        let nsError = firestoreError as NSError

        // Firestore error codes
        switch nsError.code {
        case 7: return .permissionDenied
        case 5: return .dataNotFound
        case 14: return .networkUnavailable
        case 8: return .quotaExceeded
        default: return .unknown(firestoreError.localizedDescription)
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
        case .networkUnavailable, .timeout, .serverError:
            title = "Connection Error"
        case .notAuthenticated, .invalidCredentials, .accountNotFound, .emailAlreadyInUse, .weakPassword, .sessionExpired:
            title = "Sign In Error"
        case .dataNotFound, .invalidData, .saveFailed, .deleteFailed, .syncFailed:
            title = "Data Error"
        case .permissionDenied, .locationDenied, .cameraNotAvailable:
            title = "Permission Required"
        case .productNotFound, .purchaseFailed, .purchaseCancelled, .receiptValidationFailed:
            title = "Purchase Error"
        case .apiKeyMissing, .rateLimitExceeded, .quotaExceeded:
            title = "Service Error"
        case .unknown:
            title = "Error"
        }

        var message = error.errorDescription ?? "An unexpected error occurred."
        if let suggestion = error.recoverySuggestion {
            message += "\n\n" + suggestion
        }

        return (title, message)
    }
}
