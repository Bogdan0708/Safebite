import SwiftUI
import ComposableArchitecture

/// Search view for finding gluten-free restaurants
struct SearchView: View {
    @Bindable var store: StoreOf<SearchFeature>
    @FocusState private var isSearchFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                searchBar

                // Content
                if store.searchQuery.isEmpty {
                    emptyStateView
                } else if store.isSearching {
                    loadingView
                } else if store.searchResults.isEmpty {
                    noResultsView
                } else {
                    resultsList
                }
            }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 12) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)

                TextField("Search restaurants, cuisines...", text: $store.searchQuery.sending(\.searchQueryChanged))
                    .textFieldStyle(.plain)
                    .focused($isSearchFocused)
                    .submitLabel(.search)
                    .onSubmit {
                        store.send(.performSearch)
                    }

                if !store.searchQuery.isEmpty {
                    Button {
                        store.send(.clearSearch)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(12)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))

            if isSearchFocused {
                Button("Cancel") {
                    isSearchFocused = false
                    store.send(.clearSearch)
                }
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .padding()
        .animation(.easeInOut(duration: 0.2), value: isSearchFocused)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Quick filters
                VStack(alignment: .leading, spacing: 12) {
                    Text("Quick Filters")
                        .font(.headline)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            QuickFilterButton(
                                title: "Celiac Safe",
                                icon: "checkmark.shield.fill",
                                isSelected: store.onlyCeliacSafe
                            ) {
                                store.send(.onlyCeliacSafeToggled)
                            }

                            QuickFilterButton(
                                title: "Verified Only",
                                icon: "checkmark.seal.fill",
                                isSelected: store.onlyVerified
                            ) {
                                store.send(.onlyVerifiedToggled)
                            }
                        }
                    }
                }

                // Cuisine types
                VStack(alignment: .leading, spacing: 12) {
                    Text("Browse by Cuisine")
                        .font(.headline)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 12) {
                        ForEach(CuisineType.allCases.prefix(12), id: \.self) { cuisine in
                            CuisineButton(cuisine: cuisine) {
                                store.send(.cuisineSelected(cuisine))
                                store.send(.performSearch)
                            }
                        }
                    }
                }

                // Recent searches
                if !store.recentSearches.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("Recent Searches")
                                .font(.headline)
                            Spacer()
                            Button("Clear") {
                                store.send(.clearRecentSearches)
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }

                        ForEach(store.recentSearches, id: \.self) { search in
                            Button {
                                store.send(.recentSearchTapped(search))
                            } label: {
                                HStack {
                                    Image(systemName: "clock.arrow.circlepath")
                                        .foregroundStyle(.secondary)
                                    Text(search)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    Image(systemName: "arrow.up.left")
                                        .foregroundStyle(.secondary)
                                        .font(.caption)
                                }
                            }
                        }
                    }
                }
            }
            .padding()
        }
    }

    // MARK: - Loading

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Searching for safe restaurants...")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - No Results

    private var noResultsView: some View {
        VStack(spacing: 16) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 50))
                .foregroundStyle(.secondary)

            Text("No restaurants found")
                .font(.headline)

            Text("Try a different search term or adjust your filters")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Clear Filters") {
                store.send(.clearFilters)
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Results List

    private var resultsList: some View {
        List {
            Section {
                Text("\(store.searchResults.count) restaurants found")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
            }

            ForEach(store.searchResults) { restaurant in
                RestaurantListRow(restaurant: restaurant)
                    .onTapGesture {
                        store.send(.restaurantTapped(restaurant))
                    }
            }
        }
        .listStyle(.plain)
    }
}

// MARK: - Quick Filter Button

struct QuickFilterButton: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                Text(title)
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(isSelected ? Color.green : Color(.systemGray6))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
    }
}

// MARK: - Cuisine Button

struct CuisineButton: View {
    let cuisine: CuisineType
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Text(cuisine.icon)
                    .font(.title)

                Text(cuisine.rawValue)
                    .font(.caption)
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Restaurant List Row

struct RestaurantListRow: View {
    let restaurant: RestaurantAnnotation

    var body: some View {
        HStack(spacing: 12) {
            // Trust score indicator
            ZStack {
                Circle()
                    .fill(restaurant.trustScore.level.color.opacity(0.2))
                    .frame(width: 50, height: 50)

                VStack(spacing: 0) {
                    Text("\(restaurant.trustScore.total)")
                        .font(.headline.bold())
                        .foregroundStyle(restaurant.trustScore.level.color)
                }
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(restaurant.name)
                        .font(.headline)

                    if restaurant.isCeliacSafe {
                        Image(systemName: "checkmark.shield.fill")
                            .foregroundStyle(.green)
                            .font(.caption)
                    }
                }

                HStack(spacing: 8) {
                    Text(restaurant.cuisineType)
                    Text("•")
                    Text(restaurant.priceLevel.symbol)

                    if let distance = restaurant.distance {
                        Text("•")
                        Text(formatDistance(distance))
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                // Trust level badge
                Text(restaurant.trustScore.level.rawValue)
                    .font(.caption2.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(restaurant.trustScore.level.color.opacity(0.15))
                    .foregroundStyle(restaurant.trustScore.level.color)
                    .clipShape(Capsule())
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundStyle(.secondary)
                .font(.caption)
        }
        .padding(.vertical, 4)
    }

    private func formatDistance(_ meters: Double) -> String {
        if meters < 1000 {
            return "\(Int(meters))m"
        } else {
            return String(format: "%.1fkm", meters / 1000)
        }
    }
}

// MARK: - Preview

#Preview {
    SearchView(
        store: Store(initialState: SearchFeature.State()) {
            SearchFeature()
        }
    )
}
