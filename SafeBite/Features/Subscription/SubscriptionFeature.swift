import Foundation
import ComposableArchitecture
import StoreKit

/// Subscription feature for managing premium subscriptions
@Reducer
struct SubscriptionFeature {
    @ObservableState
    struct State: Equatable {
        var products: [SubscriptionProduct] = []
        var selectedProductId: String?
        var subscriptionStatus: SubscriptionTier = .free
        var expirationDate: Date?
        var isLoading: Bool = false
        var isPurchasing: Bool = false
        var errorMessage: String?
        var showSuccessMessage: Bool = false

        var selectedProduct: SubscriptionProduct? {
            products.first { $0.id == selectedProductId }
        }

        var canPurchase: Bool {
            selectedProductId != nil && !isPurchasing
        }
    }

    enum Action: Equatable {
        case onAppear
        case loadProducts
        case productsLoaded([SubscriptionProduct])
        case loadFailed(String)

        case productSelected(String)
        case purchaseTapped
        case purchaseCompleted(SubscriptionTier)
        case purchaseFailed(String)
        case purchaseCancelled

        case restorePurchasesTapped
        case restoreCompleted(SubscriptionTier)
        case restoreFailed(String)

        case dismissError
        case dismissSuccess
    }

    @Dependency(\.subscriptionClient) var subscriptionClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                state.subscriptionStatus = SubscriptionService.loadCachedSubscriptionTier()
                state.expirationDate = SubscriptionService.loadCachedExpirationDate()
                return .send(.loadProducts)

            case .loadProducts:
                state.isLoading = true
                state.errorMessage = nil

                return .run { send in
                    do {
                        let products = try await subscriptionClient.loadProducts()
                        await send(.productsLoaded(products))
                    } catch {
                        await send(.loadFailed(error.localizedDescription))
                    }
                }

            case .productsLoaded(let products):
                state.isLoading = false
                state.products = products
                // Auto-select yearly as recommended
                state.selectedProductId = products.first { $0.isYearly }?.id ?? products.first?.id
                return .none

            case .loadFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .productSelected(let id):
                state.selectedProductId = id
                return .none

            case .purchaseTapped:
                guard let productId = state.selectedProductId else { return .none }

                state.isPurchasing = true
                state.errorMessage = nil

                return .run { send in
                    do {
                        let tier = try await subscriptionClient.purchase(productId)
                        if let tier = tier {
                            await send(.purchaseCompleted(tier))
                        } else {
                            await send(.purchaseCancelled)
                        }
                    } catch {
                        await send(.purchaseFailed(error.localizedDescription))
                    }
                }

            case .purchaseCompleted(let tier):
                state.isPurchasing = false
                state.subscriptionStatus = tier
                state.showSuccessMessage = true
                return .none

            case .purchaseFailed(let message):
                state.isPurchasing = false
                state.errorMessage = message
                return .none

            case .purchaseCancelled:
                state.isPurchasing = false
                return .none

            case .restorePurchasesTapped:
                state.isLoading = true
                state.errorMessage = nil

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
                state.subscriptionStatus = tier
                if tier != .free {
                    state.showSuccessMessage = true
                }
                return .none

            case .restoreFailed(let message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .dismissError:
                state.errorMessage = nil
                return .none

            case .dismissSuccess:
                state.showSuccessMessage = false
                return .none
            }
        }
    }
}

// MARK: - Subscription Product (Equatable wrapper)

struct SubscriptionProduct: Equatable, Identifiable {
    let id: String
    let displayName: String
    let description: String
    let displayPrice: String
    let pricePerMonth: String
    let isYearly: Bool
    let savingsPercentage: Int?

    static func == (lhs: SubscriptionProduct, rhs: SubscriptionProduct) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Subscription Client

struct SubscriptionClient {
    var loadProducts: @Sendable () async throws -> [SubscriptionProduct]
    var purchase: @Sendable (String) async throws -> SubscriptionTier?
    var restorePurchases: @Sendable () async throws -> SubscriptionTier
    var currentTier: @Sendable () -> SubscriptionTier
}

extension SubscriptionClient: DependencyKey {
    static let liveValue = SubscriptionClient(
        loadProducts: {
            await SubscriptionService.shared.loadProducts()

            let service = await SubscriptionService.shared
            var result: [SubscriptionProduct] = []

            if let monthly = await service.monthlyProduct {
                result.append(SubscriptionProduct(
                    id: monthly.id,
                    displayName: monthly.displayName,
                    description: monthly.description,
                    displayPrice: monthly.displayPrice,
                    pricePerMonth: monthly.displayPrice,
                    isYearly: false,
                    savingsPercentage: nil
                ))
            }

            if let yearly = await service.yearlyProduct {
                let savings = await service.yearlySavingsPercentage
                let monthlyPrice = yearly.price / 12

                result.append(SubscriptionProduct(
                    id: yearly.id,
                    displayName: yearly.displayName,
                    description: yearly.description,
                    displayPrice: yearly.displayPrice,
                    pricePerMonth: monthlyPrice.formatted(.currency(code: yearly.priceFormatStyle.currencyCode ?? "GBP")),
                    isYearly: true,
                    savingsPercentage: savings
                ))
            }

            return result
        },
        purchase: { productId in
            let service = await SubscriptionService.shared
            guard let product = await service.products.first(where: { $0.id == productId }) else {
                throw SubscriptionError.productNotFound
            }

            let transaction = try await service.purchase(product)
            if transaction != nil {
                return await service.subscriptionStatus.tier
            }
            return nil
        },
        restorePurchases: {
            let service = await SubscriptionService.shared
            await service.restorePurchases()
            return await service.subscriptionStatus.tier
        },
        currentTier: {
            SubscriptionService.loadCachedSubscriptionTier()
        }
    )

    static let testValue = SubscriptionClient(
        loadProducts: {
            [
                SubscriptionProduct(
                    id: "com.safebite.premium.monthly",
                    displayName: "Monthly",
                    description: "Billed monthly",
                    displayPrice: "£3.99",
                    pricePerMonth: "£3.99",
                    isYearly: false,
                    savingsPercentage: nil
                ),
                SubscriptionProduct(
                    id: "com.safebite.premium.yearly",
                    displayName: "Yearly",
                    description: "Billed annually",
                    displayPrice: "£29.99",
                    pricePerMonth: "£2.50",
                    isYearly: true,
                    savingsPercentage: 37
                )
            ]
        },
        purchase: { _ in .premiumMonthly },
        restorePurchases: { .free },
        currentTier: { .free }
    )
}

extension DependencyValues {
    var subscriptionClient: SubscriptionClient {
        get { self[SubscriptionClient.self] }
        set { self[SubscriptionClient.self] = newValue }
    }
}
