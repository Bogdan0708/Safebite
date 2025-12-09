import Foundation
import StoreKit

/// StoreKit 2 subscription service for SafeBite Premium
@MainActor
final class SubscriptionService: ObservableObject {
    static let shared = SubscriptionService()

    // Product identifiers
    static let monthlyProductId = "com.safebite.premium.monthly"
    static let yearlyProductId = "com.safebite.premium.yearly"

    @Published var products: [Product] = []
    @Published var purchasedSubscriptions: [Product] = []
    @Published var subscriptionStatus: SubscriptionStatus = .notSubscribed
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?

    private var updateListenerTask: Task<Void, Error>?

    private init() {
        updateListenerTask = listenForTransactions()
        Task {
            await loadProducts()
            await updateSubscriptionStatus()
        }
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Load Products

    func loadProducts() async {
        isLoading = true
        errorMessage = nil

        do {
            let productIds = [Self.monthlyProductId, Self.yearlyProductId]
            let storeProducts = try await Product.products(for: productIds)

            // Sort by price (monthly first, then yearly)
            products = storeProducts.sorted { $0.price < $1.price }
            isLoading = false
        } catch {
            errorMessage = "Failed to load products: \(error.localizedDescription)"
            isLoading = false
        }
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async throws -> StoreKit.Transaction? {
        isLoading = true
        errorMessage = nil

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)

                // Update subscription status
                await updateSubscriptionStatus()

                // Finish the transaction
                await transaction.finish()

                isLoading = false
                return transaction

            case .userCancelled:
                isLoading = false
                return nil

            case .pending:
                isLoading = false
                errorMessage = "Purchase is pending approval"
                return nil

            @unknown default:
                isLoading = false
                return nil
            }
        } catch {
            isLoading = false
            errorMessage = "Purchase failed: \(error.localizedDescription)"
            throw error
        }
    }

    // MARK: - Restore Purchases

    func restorePurchases() async {
        isLoading = true
        errorMessage = nil

        do {
            try await AppStore.sync()
            await updateSubscriptionStatus()
            isLoading = false
        } catch {
            errorMessage = "Failed to restore purchases: \(error.localizedDescription)"
            isLoading = false
        }
    }

    // MARK: - Subscription Status

    func updateSubscriptionStatus() async {
        var hasActiveSubscription = false
        var expirationDate: Date?
        var productId: String?

        // Check for active subscriptions
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)

                if transaction.productType == .autoRenewable {
                    hasActiveSubscription = true
                    expirationDate = transaction.expirationDate
                    productId = transaction.productID
                }
            } catch {
                print("Failed to verify transaction: \(error)")
            }
        }

        if hasActiveSubscription {
            let tier: SubscriptionTier = productId == Self.yearlyProductId ? .premiumYearly : .premiumMonthly
            subscriptionStatus = .subscribed(tier: tier, expiresAt: expirationDate)

            // Update purchased subscriptions array
            purchasedSubscriptions = products.filter { $0.id == productId }
        } else {
            subscriptionStatus = .notSubscribed
            purchasedSubscriptions = []
        }

        // Save to UserDefaults for quick access
        saveSubscriptionStatus()
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached {
            for await result in Transaction.updates {
                do {
                    let transaction = try await self.checkVerified(result)

                    // Update subscription status
                    await self.updateSubscriptionStatus()

                    // Finish the transaction
                    await transaction.finish()
                } catch {
                    print("Transaction verification failed: \(error)")
                }
            }
        }
    }

    // MARK: - Verification

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw SubscriptionError.verificationFailed(error)
        case .verified(let safe):
            return safe
        }
    }

    // MARK: - Persistence

    private func saveSubscriptionStatus() {
        switch subscriptionStatus {
        case .subscribed(let tier, let expiresAt):
            UserDefaults.standard.set(tier.rawValue, forKey: "subscriptionTier")
            UserDefaults.standard.set(expiresAt, forKey: "subscriptionExpiresAt")
        case .notSubscribed:
            UserDefaults.standard.set(SubscriptionTier.free.rawValue, forKey: "subscriptionTier")
            UserDefaults.standard.removeObject(forKey: "subscriptionExpiresAt")
        }
    }

    static func loadCachedSubscriptionTier() -> SubscriptionTier {
        let rawValue = UserDefaults.standard.string(forKey: "subscriptionTier") ?? SubscriptionTier.free.rawValue
        return SubscriptionTier(rawValue: rawValue) ?? .free
    }

    static func loadCachedExpirationDate() -> Date? {
        UserDefaults.standard.object(forKey: "subscriptionExpiresAt") as? Date
    }

    // MARK: - Helper Properties

    var monthlyProduct: Product? {
        products.first { $0.id == Self.monthlyProductId }
    }

    var yearlyProduct: Product? {
        products.first { $0.id == Self.yearlyProductId }
    }

    var yearlySavingsPercentage: Int? {
        guard let monthly = monthlyProduct,
              let yearly = yearlyProduct else { return nil }

        let monthlyAnnualCost = monthly.price * 12
        let yearlyCost = yearly.price
        let savings = (monthlyAnnualCost - yearlyCost) / monthlyAnnualCost * 100

        return Int(savings.rounded())
    }

    var isSubscribed: Bool {
        if case .subscribed = subscriptionStatus {
            return true
        }
        return false
    }
}

// MARK: - Subscription Status

enum SubscriptionStatus: Equatable {
    case notSubscribed
    case subscribed(tier: SubscriptionTier, expiresAt: Date?)

    var tier: SubscriptionTier {
        switch self {
        case .notSubscribed:
            return .free
        case .subscribed(let tier, _):
            return tier
        }
    }
}

// MARK: - Subscription Error

enum SubscriptionError: LocalizedError {
    case verificationFailed(Error)
    case purchaseFailed(String)
    case productNotFound

    var errorDescription: String? {
        switch self {
        case .verificationFailed(let error):
            return "Verification failed: \(error.localizedDescription)"
        case .purchaseFailed(let message):
            return message
        case .productNotFound:
            return "Product not found"
        }
    }
}

// MARK: - Premium Features

struct PremiumFeatures {
    /// Features available in free tier
    static let freeFeatures: [PremiumFeature] = [
        PremiumFeature(icon: "map", title: "Map View", description: "Find restaurants on the map"),
        PremiumFeature(icon: "magnifyingglass", title: "Basic Search", description: "Search by name and location"),
        PremiumFeature(icon: "heart", title: "Save 5 Restaurants", description: "Save up to 5 favourites"),
        PremiumFeature(icon: "star", title: "Read Reviews", description: "View community reviews")
    ]

    /// Features available in premium tier
    static let premiumFeatures: [PremiumFeature] = [
        PremiumFeature(icon: "heart.fill", title: "Unlimited Saves", description: "Save as many restaurants as you like"),
        PremiumFeature(icon: "icloud", title: "Cloud Sync", description: "Sync across all your devices"),
        PremiumFeature(icon: "bell.fill", title: "Safety Alerts", description: "Get notified about incidents at saved restaurants"),
        PremiumFeature(icon: "doc.text.fill", title: "Detailed Reports", description: "Access full safety reports and verification details"),
        PremiumFeature(icon: "arrow.down.circle.fill", title: "Offline Access", description: "Download restaurant data for offline use"),
        PremiumFeature(icon: "person.2.fill", title: "Priority Support", description: "Get help faster from our team")
    ]
}

struct PremiumFeature: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let description: String
}
