import SwiftUI
import ComposableArchitecture

/// Premium subscription paywall view
struct SubscriptionView: View {
    @Bindable var store: StoreOf<SubscriptionFeature>
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerSection

                    // Features
                    featuresSection

                    // Products
                    if !store.products.isEmpty {
                        productsSection
                    } else if store.isLoading {
                        ProgressView()
                            .padding()
                    }

                    // Purchase button
                    purchaseButton

                    // Restore purchases
                    restoreButton

                    // Terms
                    termsSection
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .alert("Error", isPresented: .constant(store.errorMessage != nil)) {
                Button("OK") {
                    store.send(.dismissError)
                }
            } message: {
                if let error = store.errorMessage {
                    Text(error)
                }
            }
            .alert("Welcome to Premium!", isPresented: $store.showSuccessMessage.sending(\.dismissSuccess)) {
                Button("Continue") {
                    dismiss()
                }
            } message: {
                Text("Thank you for subscribing! You now have access to all premium features.")
            }
            .onAppear {
                store.send(.onAppear)
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Icon
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.green, .green.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 80, height: 80)

                Image(systemName: "crown.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.white)
            }

            VStack(spacing: 8) {
                Text("SafeBite Premium")
                    .font(.title.bold())

                Text("Unlock all features and dine with confidence")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Features

    private var featuresSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Premium Features")
                .font(.headline)

            VStack(spacing: 12) {
                ForEach(PremiumFeatures.premiumFeatures) { feature in
                    FeatureRow(feature: feature)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Products

    private var productsSection: some View {
        VStack(spacing: 12) {
            ForEach(store.products) { product in
                ProductCard(
                    product: product,
                    isSelected: store.selectedProductId == product.id,
                    onSelect: { store.send(.productSelected(product.id)) }
                )
            }
        }
    }

    // MARK: - Purchase Button

    private var purchaseButton: some View {
        Button {
            store.send(.purchaseTapped)
        } label: {
            if store.isPurchasing {
                ProgressView()
                    .tint(.white)
            } else {
                VStack(spacing: 4) {
                    Text("Subscribe Now")
                        .font(.headline)

                    if let product = store.selectedProduct {
                        Text(product.displayPrice + (product.isYearly ? "/year" : "/month"))
                            .font(.caption)
                            .opacity(0.9)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(store.canPurchase ? Color.green : Color.gray)
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .disabled(!store.canPurchase)
    }

    // MARK: - Restore Button

    private var restoreButton: some View {
        Button {
            store.send(.restorePurchasesTapped)
        } label: {
            Text("Restore Purchases")
                .font(.subheadline)
        }
        .disabled(store.isLoading)
    }

    // MARK: - Terms

    private var termsSection: some View {
        VStack(spacing: 8) {
            Text("Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Manage your subscriptions in Settings.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            HStack(spacing: 16) {
                Link("Terms of Service", destination: URL(string: "https://safebite.app/terms")!)
                Link("Privacy Policy", destination: URL(string: "https://safebite.app/privacy")!)
            }
            .font(.caption2)
        }
        .padding(.top, 8)
    }
}

// MARK: - Feature Row

struct FeatureRow: View {
    let feature: PremiumFeature

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: feature.icon)
                .font(.title3)
                .foregroundStyle(.green)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(feature.title)
                    .font(.subheadline.weight(.medium))

                Text(feature.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }
}

// MARK: - Product Card

struct ProductCard: View {
    let product: SubscriptionProduct
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(product.displayName)
                            .font(.headline)

                        if product.isYearly, let savings = product.savingsPercentage {
                            Text("Save \(savings)%")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.green)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                    }

                    Text("\(product.pricePerMonth)/month")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(product.displayPrice)
                        .font(.title3.bold())

                    Text(product.isYearly ? "per year" : "per month")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Selection indicator
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(isSelected ? .green : .secondary)
                    .padding(.leading, 8)
            }
            .padding()
            .background(isSelected ? Color.green.opacity(0.1) : Color(.systemGray6))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.green : Color.clear, lineWidth: 2)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Simplified Paywall for Profile

struct PremiumPaywallView: View {
    let currentTier: SubscriptionTier
    let onUpgrade: () -> Void
    let onRestore: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        SubscriptionView(
            store: Store(initialState: SubscriptionFeature.State()) {
                SubscriptionFeature()
            }
        )
    }
}

// MARK: - Preview

#Preview {
    SubscriptionView(
        store: Store(initialState: SubscriptionFeature.State(
            products: [
                SubscriptionProduct(
                    id: "monthly",
                    displayName: "Monthly",
                    description: "Billed monthly",
                    displayPrice: "£3.99",
                    pricePerMonth: "£3.99",
                    isYearly: false,
                    savingsPercentage: nil
                ),
                SubscriptionProduct(
                    id: "yearly",
                    displayName: "Yearly",
                    description: "Billed annually",
                    displayPrice: "£29.99",
                    pricePerMonth: "£2.50",
                    isYearly: true,
                    savingsPercentage: 37
                )
            ],
            selectedProductId: "yearly"
        )) {
            SubscriptionFeature()
        }
    )
}
