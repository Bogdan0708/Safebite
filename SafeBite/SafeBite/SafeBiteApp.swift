import SwiftUI
import SwiftData
import ComposableArchitecture
import FirebaseCore
import FirebaseAuth
import FirebaseCrashlytics

/// SafeBite - Gluten-free restaurant finder for Europe & UK
/// Helping people with coeliac disease find safe dining options through
/// transparent, verifiable trust scores.

// MARK: - App Delegate for Firebase

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Configure Firebase
        FirebaseApp.configure()

        // Enable Crashlytics collection (disable in debug if needed)
        #if DEBUG
        // Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(false)
        #endif

        return true
    }
}

@main
struct SafeBiteApp: App {
    // Register app delegate for Firebase setup
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate

    // Main app store using TCA
    static let store = Store(initialState: AppFeature.State()) {
        AppFeature()
    }

    var body: some Scene {
        WindowGroup {
            AppView(store: SafeBiteApp.store)
                .modelContainer(PersistenceService.shared.container)
        }
    }
}

// MARK: - App Feature (Root Reducer)

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var selectedTab: Tab = .map
        var map = MapFeature.State()
        var search = SearchFeature.State()
        var saved = SavedFeature.State()
        var profile = ProfileFeature.State()
        var isAuthenticated = false
        var hasCompletedOnboarding = false
        var gdprConsentGiven = false
    }

    enum Tab: Equatable {
        case map
        case search
        case saved
        case profile
    }

    enum Action {
        case tabSelected(Tab)
        case map(MapFeature.Action)
        case search(SearchFeature.Action)
        case saved(SavedFeature.Action)
        case profile(ProfileFeature.Action)
        case onAppear
        case checkAuthStatus
        case authStatusReceived(Bool)
        case gdprConsentGiven
        case completeOnboarding
    }

    var body: some ReducerOf<Self> {
        Scope(state: \.map, action: \.map) {
            MapFeature()
        }
        Scope(state: \.search, action: \.search) {
            SearchFeature()
        }
        Scope(state: \.saved, action: \.saved) {
            SavedFeature()
        }
        Scope(state: \.profile, action: \.profile) {
            ProfileFeature()
        }

        Reduce { state, action in
            switch action {
            case .tabSelected(let tab):
                state.selectedTab = tab
                return .none

            case .onAppear:
                // Check GDPR consent and auth status on launch
                state.gdprConsentGiven = UserDefaults.standard.bool(forKey: "gdprConsentGiven")
                state.hasCompletedOnboarding = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")
                return .send(.checkAuthStatus)

            case .checkAuthStatus:
                // TODO: Check Firebase auth status
                return .none

            case .authStatusReceived(let isAuthenticated):
                state.isAuthenticated = isAuthenticated
                return .none

            case .gdprConsentGiven:
                state.gdprConsentGiven = true
                UserDefaults.standard.set(true, forKey: "gdprConsentGiven")
                return .none

            case .completeOnboarding:
                state.hasCompletedOnboarding = true
                UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
                return .none

            case .map, .search, .saved, .profile:
                return .none
            }
        }
    }
}

// MARK: - App View

struct AppView: View {
    @Bindable var store: StoreOf<AppFeature>

    var body: some View {
        Group {
            if !store.gdprConsentGiven {
                GDPRConsentView(store: store)
            } else if !store.hasCompletedOnboarding {
                OnboardingView(store: store)
            } else {
                mainTabView
            }
        }
        .onAppear {
            store.send(.onAppear)
        }
    }

    private var mainTabView: some View {
        TabView(selection: $store.selectedTab.sending(\.tabSelected)) {
            MapView(
                store: store.scope(state: \.map, action: \.map)
            )
            .tabItem {
                Label("Map", systemImage: "map.fill")
            }
            .tag(AppFeature.Tab.map)

            SearchView(
                store: store.scope(state: \.search, action: \.search)
            )
            .tabItem {
                Label("Search", systemImage: "magnifyingglass")
            }
            .tag(AppFeature.Tab.search)

            SavedView(
                store: store.scope(state: \.saved, action: \.saved)
            )
            .tabItem {
                Label("Saved", systemImage: "heart.fill")
            }
            .tag(AppFeature.Tab.saved)

            ProfileView(
                store: store.scope(state: \.profile, action: \.profile)
            )
            .tabItem {
                Label("Profile", systemImage: "person.fill")
            }
            .tag(AppFeature.Tab.profile)
        }
        .tint(.green) // SafeBite brand color
    }
}

// MARK: - GDPR Consent View

struct GDPRConsentView: View {
    let store: StoreOf<AppFeature>

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Logo
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 60))
                        .foregroundStyle(.green)

                    Text("Welcome to SafeBite")
                        .font(.largeTitle.bold())

                    Text("Your trusted guide to gluten-free dining across Europe & UK")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    Divider()

                    // GDPR Info
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Your Privacy Matters")
                            .font(.headline)

                        GDPRInfoRow(
                            icon: "shield.fill",
                            title: "Health Data Protection",
                            description: "Your dietary preferences are sensitive health data. We encrypt everything and never share with third parties."
                        )

                        GDPRInfoRow(
                            icon: "hand.raised.fill",
                            title: "Your Control",
                            description: "You can export or delete your data anytime from Settings."
                        )

                        GDPRInfoRow(
                            icon: "location.fill",
                            title: "Location Access",
                            description: "We use your location only to find nearby restaurants. It's never stored on our servers."
                        )

                        GDPRInfoRow(
                            icon: "server.rack",
                            title: "EU Data Storage",
                            description: "All data is stored in EU data centers (europe-west1) for GDPR compliance."
                        )
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Consent Button
                    Button {
                        store.send(.gdprConsentGiven)
                    } label: {
                        Text("I Agree & Continue")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.green)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    // Privacy Policy Link
                    Link("Read Full Privacy Policy", destination: URL(string: "https://safebite.app/privacy")!)
                        .font(.footnote)
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct GDPRInfoRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.green)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.bold())
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Placeholder Views

struct OnboardingView: View {
    let store: StoreOf<AppFeature>
    @State private var currentPage = 0

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            icon: "shield.checkered",
            title: "Trust Scores You Can Rely On",
            description: "Our three-tier scoring system combines professional verification, community reviews, and data freshness to give you confidence in every restaurant.",
            color: .green
        ),
        OnboardingPage(
            icon: "person.2.fill",
            title: "Community-Powered Safety",
            description: "Reviews from verified coeliacs who understand cross-contamination. Every reviewer passes our safety knowledge quiz.",
            color: .blue
        ),
        OnboardingPage(
            icon: "checklist",
            title: "Know What to Ask",
            description: "Get cuisine-specific questions to ask staff, from dedicated fryers to separate prep areas. Knowledge is safety.",
            color: .orange
        ),
        OnboardingPage(
            icon: "map.fill",
            title: "Find Safe Dining Anywhere",
            description: "Discover gluten-free restaurants across Europe and the UK. Filter by certification, dedicated kitchens, and more.",
            color: .purple
        )
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Skip button
            HStack {
                Spacer()
                Button("Skip") {
                    store.send(.completeOnboarding)
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding()
            }

            // Page content
            TabView(selection: $currentPage) {
                ForEach(pages.indices, id: \.self) { index in
                    OnboardingPageView(page: pages[index])
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Page indicators
            HStack(spacing: 8) {
                ForEach(pages.indices, id: \.self) { index in
                    Circle()
                        .fill(currentPage == index ? Color.green : Color.gray.opacity(0.3))
                        .frame(width: 8, height: 8)
                        .animation(.easeInOut, value: currentPage)
                }
            }
            .padding(.bottom, 20)

            // Action button
            Button {
                if currentPage < pages.count - 1 {
                    withAnimation {
                        currentPage += 1
                    }
                } else {
                    store.send(.completeOnboarding)
                }
            } label: {
                Text(currentPage < pages.count - 1 ? "Continue" : "Get Started")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.green)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
    }
}

struct OnboardingPage {
    let icon: String
    let title: String
    let description: String
    let color: Color
}

struct OnboardingPageView: View {
    let page: OnboardingPage

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .fill(page.color.opacity(0.15))
                    .frame(width: 140, height: 140)

                Image(systemName: page.icon)
                    .font(.system(size: 60))
                    .foregroundStyle(page.color)
            }

            // Text
            VStack(spacing: 16) {
                Text(page.title)
                    .font(.title.bold())
                    .multilineTextAlignment(.center)

                Text(page.description)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()
            Spacer()
        }
        .padding()
    }
}


#Preview {
    AppView(
        store: Store(initialState: AppFeature.State(gdprConsentGiven: true, hasCompletedOnboarding: true)) {
            AppFeature()
        }
    )
}
