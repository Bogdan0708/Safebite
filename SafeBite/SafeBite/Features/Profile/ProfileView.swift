import SwiftUI
import ComposableArchitecture

/// Profile view for user settings and account management
struct ProfileView: View {
    @Bindable var store: StoreOf<ProfileFeature>

    var body: some View {
        NavigationStack {
            List {
                if store.isLoggedIn {
                    loggedInContent
                } else {
                    signInSection
                }

                settingsSection
                premiumSection
                privacySection
                aboutSection
            }
            .navigationTitle("Profile")
            .sheet(isPresented: $store.showLanguagePicker.sending(\.toggleLanguagePicker)) {
                LanguagePickerSheet(
                    selectedLanguage: store.selectedLanguage,
                    onSelect: { store.send(.languageSelected($0)) }
                )
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $store.showSignIn.sending(\.dismissSignIn)) {
                AuthView(
                    store: Store(initialState: AuthFeature.State()) {
                        AuthFeature()
                    }
                )
            }
            .sheet(isPresented: $store.showPremiumPaywall.sending(\.togglePremiumPaywall)) {
                PremiumPaywallView(
                    currentTier: store.subscriptionTier,
                    onUpgrade: { store.send(.upgradeToPremium) },
                    onRestore: { store.send(.restorePurchases) }
                )
            }
            .alert("Sign Out", isPresented: $store.showSignOutConfirmation.sending(\.toggleSignOutConfirmation)) {
                Button("Cancel", role: .cancel) {}
                Button("Sign Out", role: .destructive) {
                    store.send(.signOutConfirmed)
                }
            } message: {
                Text("Are you sure you want to sign out?")
            }
            .alert("Delete Account", isPresented: $store.showDeleteAccountConfirmation.sending(\.toggleDeleteAccountConfirmation)) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    store.send(.deleteAccountConfirmed)
                }
            } message: {
                Text("This will permanently delete your account and all your data. This action cannot be undone.")
            }
            .alert("Error", isPresented: .constant(store.errorMessage != nil)) {
                Button("OK") {
                    store.send(.clearError)
                }
            } message: {
                if let error = store.errorMessage {
                    Text(error)
                }
            }
            .onAppear {
                store.send(.onAppear)
            }
        }
    }

    // MARK: - Sign In Section

    private var signInSection: some View {
        Section {
            VStack(spacing: 16) {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 60))
                    .foregroundStyle(.secondary)

                Text("Sign in to SafeBite")
                    .font(.headline)

                Text("Save your favourite restaurants, leave reviews, and sync across devices.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button {
                    store.send(.signInTapped)
                } label: {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
            .padding(.vertical)
        }
    }

    // MARK: - Logged In Content

    @ViewBuilder
    private var loggedInContent: some View {
        // User info
        Section {
            HStack(spacing: 16) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(Color.green.opacity(0.2))
                        .frame(width: 60, height: 60)

                    Text(store.user?.displayName.prefix(1).uppercased() ?? "?")
                        .font(.title.bold())
                        .foregroundStyle(.green)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(store.user?.displayName ?? "User")
                        .font(.headline)

                    Text(store.user?.email ?? "")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    // Subscription badge
                    Text(store.subscriptionTier.rawValue)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(store.subscriptionTier == .free ? Color.gray.opacity(0.2) : Color.green.opacity(0.2))
                        .foregroundStyle(store.subscriptionTier == .free ? .gray : .green)
                        .clipShape(Capsule())
                }

                Spacer()
            }
        }

        // Health profile
        Section("Health Profile") {
            Button {
                store.send(.toggleSeverityPicker)
            } label: {
                HStack {
                    Label("Condition", systemImage: store.user?.severityLevel.icon ?? "shield")
                    Spacer()
                    Text(store.user?.severityLevel.rawValue ?? "Not set")
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
        }

        // Stats
        Section("Activity") {
            StatRow(icon: "star.fill", title: "Reviews", value: "\(store.reviewCount)")
            StatRow(icon: "heart.fill", title: "Saved", value: "\(store.savedRestaurantsCount)")
            StatRow(icon: "hand.thumbsup.fill", title: "Helpful Votes", value: "\(store.helpfulVotesCount)")
        }
    }

    // MARK: - Settings Section

    private var settingsSection: some View {
        Section("Settings") {
            // Language
            Button {
                store.send(.toggleLanguagePicker)
            } label: {
                HStack {
                    Label("Language", systemImage: "globe")
                    Spacer()
                    Text("\(store.selectedLanguage.flag) \(store.selectedLanguage.displayName)")
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            // Currency
            Button {
                store.send(.toggleCurrencyPicker)
            } label: {
                HStack {
                    Label("Currency", systemImage: "eurosign.circle")
                    Spacer()
                    Text(store.selectedCurrency.symbol)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            // Notifications
            Toggle(isOn: $store.notificationsEnabled.sending(\.notificationsToggled)) {
                Label("Notifications", systemImage: "bell")
            }

            // Location
            Toggle(isOn: $store.locationEnabled.sending(\.locationToggled)) {
                Label("Location Access", systemImage: "location")
            }
        }
    }

    // MARK: - Premium Section

    private var premiumSection: some View {
        Section {
            if store.subscriptionTier == .free {
                Button {
                    store.send(.togglePremiumPaywall)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Upgrade to Premium")
                                .font(.headline)
                                .foregroundStyle(.primary)

                            Text("Unlimited searches, offline mode & more")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text("€24.99/yr")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.green)
                    }
                    .padding(.vertical, 4)
                }
            } else {
                HStack {
                    Label("Premium Active", systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                    Spacer()
                    if let expires = store.subscriptionExpiresAt {
                        Text("Renews \(expires, style: .date)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Button("Restore Purchases") {
                store.send(.restorePurchases)
            }
            .font(.subheadline)
        }
    }

    // MARK: - Privacy Section (GDPR)

    @State private var showGDPRView = false

    private var privacySection: some View {
        Section("Privacy & Data") {
            Button {
                showGDPRView = true
            } label: {
                HStack {
                    Label("Privacy & Data Settings", systemImage: "hand.raised.fill")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .sheet(isPresented: $showGDPRView) {
                GDPRView(
                    store: Store(initialState: GDPRFeature.State()) {
                        GDPRFeature()
                    }
                )
            }

            Button {
                store.send(.exportDataTapped)
            } label: {
                Label("Export My Data", systemImage: "arrow.down.doc")
            }

            Link(destination: URL(string: "https://safebite.app/privacy")!) {
                HStack {
                    Label("Privacy Policy", systemImage: "doc.text")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if store.isLoggedIn {
                Button(role: .destructive) {
                    store.send(.deleteAccountTapped)
                } label: {
                    Label("Delete Account", systemImage: "trash")
                        .foregroundStyle(.red)
                }
            }
        }
    }

    // MARK: - About Section

    private var aboutSection: some View {
        Section("About") {
            HStack {
                Text("Version")
                Spacer()
                Text("1.0.0")
                    .foregroundStyle(.secondary)
            }

            Link(destination: URL(string: "https://safebite.app")!) {
                Label("Website", systemImage: "globe")
            }

            Link(destination: URL(string: "mailto:support@safebite.app")!) {
                Label("Contact Support", systemImage: "envelope")
            }

            if store.isLoggedIn {
                Button {
                    store.send(.signOutTapped)
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(.red)
                }
            }
        }
    }
}

// MARK: - Supporting Views

struct StatRow: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(.green)
                .frame(width: 24)
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }
}

struct LanguagePickerSheet: View {
    let selectedLanguage: Language
    let onSelect: (Language) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(Language.allCases, id: \.self) { language in
                    Button {
                        onSelect(language)
                    } label: {
                        HStack {
                            Text(language.flag)
                            Text(language.displayName)
                            Spacer()
                            if language == selectedLanguage {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .navigationTitle("Language")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct PremiumPaywallView: View {
    let currentTier: SubscriptionTier
    let onUpgrade: () -> Void
    let onRestore: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 50))
                            .foregroundStyle(.yellow)

                        Text("SafeBite Premium")
                            .font(.largeTitle.bold())

                        Text("Unlock the full potential of safe dining")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 20)

                    // Features
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(SubscriptionTier.premium.features, id: \.self) { feature in
                            HStack(spacing: 12) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                                Text(feature)
                            }
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Pricing
                    VStack(spacing: 8) {
                        Text("€24.99")
                            .font(.system(size: 44, weight: .bold))

                        Text("per year")
                            .foregroundStyle(.secondary)

                        Text("That's just €2.08/month")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    // CTA
                    Button(action: onUpgrade) {
                        Text("Start Free Trial")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.green)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    Text("7-day free trial, then €24.99/year")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Button("Restore Purchases", action: onRestore)
                        .font(.subheadline)
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Preview

#Preview {
    ProfileView(
        store: Store(initialState: ProfileFeature.State()) {
            ProfileFeature()
        }
    )
}
