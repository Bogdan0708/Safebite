import Foundation
import FirebaseAnalytics

// MARK: - Analytics Service

/// Firebase Analytics service for SafeBite
/// Tracks user engagement, restaurant views, and safety-related events
final class AnalyticsService {
    static let shared = AnalyticsService()

    private init() {}

    // MARK: - User Properties

    /// Set user properties for analytics segmentation
    func setUserProperties(
        severityLevel: String?,
        isPremium: Bool,
        isVerifiedReviewer: Bool
    ) {
        Analytics.setUserProperty(severityLevel, forName: "severity_level")
        Analytics.setUserProperty(isPremium ? "premium" : "free", forName: "subscription_tier")
        Analytics.setUserProperty(isVerifiedReviewer ? "verified" : "standard", forName: "reviewer_status")
    }

    /// Set user ID for cross-device tracking
    func setUserId(_ userId: String?) {
        Analytics.setUserID(userId)
    }

    // MARK: - Screen Tracking

    /// Log screen view
    func logScreenView(screenName: String, screenClass: String? = nil) {
        Analytics.logEvent(AnalyticsEventScreenView, parameters: [
            AnalyticsParameterScreenName: screenName,
            AnalyticsParameterScreenClass: screenClass ?? screenName
        ])
    }

    // MARK: - Restaurant Events

    /// Log when user views a restaurant
    func logRestaurantView(
        restaurantId: String,
        restaurantName: String,
        trustScore: Int,
        trustLevel: String,
        cuisineType: String
    ) {
        Analytics.logEvent("restaurant_view", parameters: [
            "restaurant_id": restaurantId,
            "restaurant_name": restaurantName,
            "trust_score": trustScore,
            "trust_level": trustLevel,
            "cuisine_type": cuisineType
        ])
    }

    /// Log when user saves a restaurant
    func logRestaurantSaved(
        restaurantId: String,
        trustScore: Int,
        isCeliacSafe: Bool
    ) {
        Analytics.logEvent("restaurant_saved", parameters: [
            "restaurant_id": restaurantId,
            "trust_score": trustScore,
            "is_celiac_safe": isCeliacSafe
        ])
    }

    /// Log when user removes a saved restaurant
    func logRestaurantUnsaved(restaurantId: String) {
        Analytics.logEvent("restaurant_unsaved", parameters: [
            "restaurant_id": restaurantId
        ])
    }

    /// Log restaurant search
    func logSearch(
        query: String,
        resultsCount: Int,
        filters: [String]
    ) {
        Analytics.logEvent(AnalyticsEventSearch, parameters: [
            AnalyticsParameterSearchTerm: query,
            "results_count": resultsCount,
            "filters": filters.joined(separator: ",")
        ])
    }

    // MARK: - Review Events

    /// Log when user submits a review
    func logReviewSubmitted(
        restaurantId: String,
        safetyRating: Int,
        hadReaction: Bool,
        isVerifiedReviewer: Bool
    ) {
        Analytics.logEvent("review_submitted", parameters: [
            "restaurant_id": restaurantId,
            "safety_rating": safetyRating,
            "had_reaction": hadReaction,
            "is_verified_reviewer": isVerifiedReviewer
        ])
    }

    /// Log incident report
    func logIncidentReported(
        restaurantId: String,
        severity: String
    ) {
        Analytics.logEvent("incident_reported", parameters: [
            "restaurant_id": restaurantId,
            "severity": severity
        ])
    }

    // MARK: - Safety Quiz Events

    /// Log quiz start
    func logQuizStarted() {
        Analytics.logEvent("safety_quiz_started", parameters: nil)
    }

    /// Log quiz completion
    func logQuizCompleted(
        passed: Bool,
        score: Int,
        totalQuestions: Int
    ) {
        Analytics.logEvent("safety_quiz_completed", parameters: [
            "passed": passed,
            "score": score,
            "total_questions": totalQuestions,
            "percentage": (score * 100) / totalQuestions
        ])
    }

    // MARK: - Filter Events

    /// Log filter usage
    func logFilterApplied(
        filterName: String,
        isEnabled: Bool
    ) {
        Analytics.logEvent("filter_applied", parameters: [
            "filter_name": filterName,
            "is_enabled": isEnabled
        ])
    }

    // MARK: - Subscription Events

    /// Log subscription view
    func logSubscriptionViewed(source: String) {
        Analytics.logEvent("subscription_viewed", parameters: [
            "source": source
        ])
    }

    /// Log subscription purchase
    func logSubscriptionPurchased(
        productId: String,
        price: Decimal,
        currency: String
    ) {
        Analytics.logEvent(AnalyticsEventPurchase, parameters: [
            AnalyticsParameterItemID: productId,
            AnalyticsParameterPrice: NSDecimalNumber(decimal: price).doubleValue,
            AnalyticsParameterCurrency: currency
        ])
    }

    /// Log subscription restore
    func logSubscriptionRestored(productId: String) {
        Analytics.logEvent("subscription_restored", parameters: [
            "product_id": productId
        ])
    }

    // MARK: - GDPR Events

    /// Log GDPR consent given
    func logGDPRConsentGiven() {
        Analytics.logEvent("gdpr_consent_given", parameters: nil)
    }

    /// Log data export requested
    func logDataExportRequested() {
        Analytics.logEvent("data_export_requested", parameters: nil)
    }

    /// Log account deletion requested
    func logAccountDeletionRequested() {
        Analytics.logEvent("account_deletion_requested", parameters: nil)
    }

    // MARK: - Onboarding Events

    /// Log onboarding step
    func logOnboardingStep(step: Int, totalSteps: Int) {
        Analytics.logEvent("onboarding_step", parameters: [
            "step": step,
            "total_steps": totalSteps
        ])
    }

    /// Log onboarding completed
    func logOnboardingCompleted(skipped: Bool) {
        Analytics.logEvent(AnalyticsEventTutorialComplete, parameters: [
            "skipped": skipped
        ])
    }

    // MARK: - Map Events

    /// Log map interaction
    func logMapInteraction(action: String) {
        Analytics.logEvent("map_interaction", parameters: [
            "action": action
        ])
    }

    /// Log directions requested
    func logDirectionsRequested(restaurantId: String) {
        Analytics.logEvent("directions_requested", parameters: [
            "restaurant_id": restaurantId
        ])
    }

    // MARK: - Error Events

    /// Log non-fatal error
    func logError(
        domain: String,
        code: Int,
        description: String
    ) {
        Analytics.logEvent("app_error", parameters: [
            "error_domain": domain,
            "error_code": code,
            "error_description": description
        ])
    }
}

// MARK: - Analytics Event Names

extension AnalyticsService {
    enum ScreenName: String {
        case map = "Map"
        case search = "Search"
        case saved = "Saved"
        case profile = "Profile"
        case restaurantDetail = "RestaurantDetail"
        case review = "Review"
        case subscription = "Subscription"
        case gdprSettings = "GDPRSettings"
        case safetyQuiz = "SafetyQuiz"
        case onboarding = "Onboarding"
        case gdprConsent = "GDPRConsent"
    }

    enum MapAction: String {
        case regionChanged = "region_changed"
        case annotationTapped = "annotation_tapped"
        case centeredOnUser = "centered_on_user"
        case filterOpened = "filter_opened"
    }
}
