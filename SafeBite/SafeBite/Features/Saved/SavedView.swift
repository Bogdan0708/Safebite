import SwiftUI
import ComposableArchitecture

/// View for displaying saved/favorite restaurants
struct SavedView: View {
    @Bindable var store: StoreOf<SavedFeature>
    @State private var showDeleteConfirmation = false
    @State private var restaurantToDelete: SavedRestaurant?

    var body: some View {
        NavigationStack {
            Group {
                if store.isLoading && store.savedRestaurants.isEmpty {
                    loadingView
                } else if store.savedRestaurants.isEmpty {
                    emptyStateView
                } else {
                    savedList
                }
            }
            .navigationTitle("Saved")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        // Sort options
                        Section("Sort By") {
                            ForEach(SavedFeature.SortOption.allCases, id: \.self) { option in
                                Button {
                                    store.send(.sortOptionChanged(option))
                                } label: {
                                    Label(option.rawValue, systemImage: option.icon)
                                    if store.sortOption == option {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }

                        // Filter options
                        Section("Filter") {
                            ForEach(SavedFeature.FilterOption.allCases, id: \.self) { option in
                                Button {
                                    store.send(.filterOptionChanged(option))
                                } label: {
                                    Label(option.rawValue, systemImage: option.icon)
                                    if store.filterOption == option {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .refreshable {
                store.send(.loadSavedRestaurants)
            }
            .alert("Remove Restaurant", isPresented: $showDeleteConfirmation, presenting: restaurantToDelete) { restaurant in
                Button("Cancel", role: .cancel) {
                    restaurantToDelete = nil
                }
                Button("Remove", role: .destructive) {
                    store.send(.removeConfirmed(restaurant.id))
                    restaurantToDelete = nil
                }
            } message: { restaurant in
                Text("Are you sure you want to remove \(restaurant.name) from your saved restaurants?")
            }
            .onAppear {
                store.send(.onAppear)
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading saved restaurants...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 24) {
            Image(systemName: "heart.slash")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)

            VStack(spacing: 8) {
                Text("No Saved Restaurants")
                    .font(.title2.bold())

                Text("Save restaurants you love by tapping the heart icon when viewing their details.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            // Quick tips
            VStack(alignment: .leading, spacing: 12) {
                TipRow(icon: "magnifyingglass", text: "Search for gluten-free restaurants near you")
                TipRow(icon: "map", text: "Explore the map to discover new places")
                TipRow(icon: "heart", text: "Tap the heart to save for later")
            }
            .padding()
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding()
    }

    // MARK: - Saved List

    private var savedList: some View {
        List {
            // Stats header
            Section {
                HStack(spacing: 20) {
                    StatBadge(
                        value: "\(store.savedRestaurants.count)",
                        label: "Saved",
                        icon: "heart.fill",
                        color: .red
                    )

                    StatBadge(
                        value: "\(store.savedRestaurants.filter { $0.hasVisited }.count)",
                        label: "Visited",
                        icon: "checkmark.circle.fill",
                        color: .green
                    )

                    StatBadge(
                        value: "\(store.savedRestaurants.filter { $0.isCeliacSafe }.count)",
                        label: "Celiac Safe",
                        icon: "checkmark.shield.fill",
                        color: .blue
                    )
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .listRowBackground(Color.clear)

            // Restaurant list
            Section {
                ForEach(store.savedRestaurants) { restaurant in
                    SavedRestaurantRow(restaurant: restaurant)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            store.send(.restaurantTapped(restaurant))
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                restaurantToDelete = restaurant
                                showDeleteConfirmation = true
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            if !restaurant.hasVisited {
                                Button {
                                    store.send(.markAsVisited(restaurant.id))
                                } label: {
                                    Label("Visited", systemImage: "checkmark.circle")
                                }
                                .tint(.green)
                            }
                        }
                }
            } header: {
                HStack {
                    Text("\(store.savedRestaurants.count) restaurants")
                    Spacer()
                    if store.filterOption != .all {
                        Text(store.filterOption.rawValue)
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.2))
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }
}

// MARK: - Saved Restaurant Row

struct SavedRestaurantRow: View {
    let restaurant: SavedRestaurant

    var body: some View {
        HStack(spacing: 12) {
            // Trust score indicator
            TrustScoreCircle(score: restaurant.trustScore)

            // Info
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(restaurant.name)
                        .font(.headline)
                        .lineLimit(1)

                    if restaurant.isCeliacSafe {
                        Image(systemName: "checkmark.shield.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }

                    if restaurant.hasVisited {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.blue)
                    }
                }

                HStack(spacing: 6) {
                    Text(restaurant.cuisineType)
                    Text("•")
                    Text(restaurant.city)
                    Text("•")
                    Text(restaurant.priceLevel.symbol)
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                // Saved date
                Text("Saved \(restaurant.savedAt, style: .relative) ago")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            // Safety badges
            VStack(alignment: .trailing, spacing: 4) {
                if restaurant.hasDedicatedKitchen {
                    SafetyMicroBadge(icon: "fork.knife", text: "Kitchen")
                }
                if restaurant.hasSeparateFryer {
                    SafetyMicroBadge(icon: "frying.pan.fill", text: "Fryer")
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Supporting Views

struct TrustScoreCircle: View {
    let score: Int

    private var color: Color {
        switch score {
        case 80...100: return .green
        case 60..<80: return .yellow
        case 30..<60: return .orange
        default: return .gray
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(color.opacity(0.15))
                .frame(width: 50, height: 50)

            Text("\(score)")
                .font(.headline.bold())
                .foregroundStyle(color)
        }
    }
}

struct SafetyMicroBadge: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: icon)
            Text(text)
        }
        .font(.caption2)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(Color.green.opacity(0.1))
        .foregroundStyle(.green)
        .clipShape(Capsule())
    }
}

struct TipRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.green)
                .frame(width: 24)

            Text(text)
                .font(.subheadline)
        }
    }
}

struct StatBadge: View {
    let value: String
    let label: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption)
                Text(value)
                    .font(.title3.bold())
            }
            .foregroundStyle(color)

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Preview

#Preview {
    SavedView(
        store: Store(initialState: SavedFeature.State()) {
            SavedFeature()
        }
    )
}
