import SwiftUI
import MapKit
import ComposableArchitecture

/// Main map view showing gluten-free restaurants
struct MapView: View {
    @Bindable var store: StoreOf<MapFeature>

    var body: some View {
        NavigationStack {
            ZStack {
                // Map
                mapContent

                // Overlays
                VStack {
                    // Filter chips
                    filterChips
                        .padding(.horizontal)

                    Spacer()

                    // Bottom controls
                    HStack {
                        Spacer()

                        // Center on user button
                        Button {
                            store.send(.centerOnUserLocation)
                        } label: {
                            Image(systemName: "location.fill")
                                .font(.title2)
                                .padding(12)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("SafeBite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        store.send(.toggleFiltersSheet)
                    } label: {
                        Image(systemName: store.activeFilters.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                    }
                }
            }
            .sheet(isPresented: $store.showFilters.sending(\.toggleFiltersSheet)) {
                FiltersSheet(store: store)
                    .presentationDetents([.medium])
            }
            .sheet(isPresented: $store.showRestaurantDetail.sending(\.dismissRestaurantDetail)) {
                if let restaurant = store.selectedRestaurant {
                    RestaurantPreviewCard(
                        restaurant: restaurant,
                        onDirections: { store.send(.openDirections(restaurant)) },
                        onViewDetails: { /* Navigate to detail */ }
                    )
                    .presentationDetents([.height(300), .medium])
                    .presentationDragIndicator(.visible)
                }
            }
            .onAppear {
                store.send(.onMapAppear)
            }
        }
    }

    // MARK: - Map Content

    @ViewBuilder
    private var mapContent: some View {
        Map(position: $store.cameraPosition.sending(\.regionChanged).mapPosition) {
            // User location
            if let userLocation = store.userLocation {
                Annotation("You", coordinate: userLocation) {
                    ZStack {
                        Circle()
                            .fill(.blue.opacity(0.25))
                            .frame(width: 40, height: 40)
                        Circle()
                            .fill(.blue)
                            .frame(width: 16, height: 16)
                        Circle()
                            .stroke(.white, lineWidth: 2)
                            .frame(width: 16, height: 16)
                    }
                }
            }

            // Restaurant markers
            ForEach(store.restaurants) { restaurant in
                Annotation(restaurant.name, coordinate: restaurant.coordinate) {
                    RestaurantMapPin(restaurant: restaurant)
                        .onTapGesture {
                            store.send(.annotationTapped(restaurant))
                        }
                }
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        .mapControls {
            MapCompass()
            MapScaleView()
        }
    }

    // MARK: - Filter Chips

    @ViewBuilder
    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(FilterOption.allCases, id: \.self) { filter in
                    FilterChip(
                        title: filter.rawValue,
                        icon: filter.icon,
                        isSelected: store.activeFilters.contains(filter)
                    ) {
                        store.send(.filterToggled(filter))
                    }
                }
            }
            .padding(.vertical, 8)
        }
    }
}

// MARK: - Restaurant Map Pin

struct RestaurantMapPin: View {
    let restaurant: RestaurantAnnotation

    var body: some View {
        VStack(spacing: 0) {
            // Pin head with trust indicator
            ZStack {
                Circle()
                    .fill(pinColor)
                    .frame(width: 36, height: 36)

                Image(systemName: restaurant.trustScore.level.icon)
                    .foregroundStyle(.white)
                    .font(.system(size: 16, weight: .bold))
            }

            // Pin tail
            Triangle()
                .fill(pinColor)
                .frame(width: 12, height: 8)
                .offset(y: -2)
        }
        .shadow(color: .black.opacity(0.2), radius: 3, y: 2)
    }

    private var pinColor: Color {
        restaurant.trustScore.level.color
    }
}

struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Filter Chip

struct FilterChip: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption)
                Text(title)
                    .font(.caption.weight(.medium))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color.green : Color(.systemGray6))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Filters Sheet

struct FiltersSheet: View {
    let store: StoreOf<MapFeature>

    var body: some View {
        NavigationStack {
            List {
                Section("Safety Filters") {
                    ForEach(FilterOption.allCases, id: \.self) { filter in
                        FilterRow(
                            filter: filter,
                            isSelected: store.activeFilters.contains(filter)
                        ) {
                            store.send(.filterToggled(filter))
                        }
                    }
                }

                Section {
                    Button("Clear All Filters") {
                        store.send(.clearFilters)
                    }
                    .foregroundStyle(.red)
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        store.send(.toggleFiltersSheet)
                    }
                }
            }
        }
    }
}

struct FilterRow: View {
    let filter: FilterOption
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: filter.icon)
                    .foregroundStyle(.green)
                    .frame(width: 24)

                Text(filter.rawValue)

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(.green)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Restaurant Preview Card

struct RestaurantPreviewCard: View {
    let restaurant: RestaurantAnnotation
    let onDirections: () -> Void
    let onViewDetails: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(restaurant.name)
                        .font(.title2.bold())

                    HStack(spacing: 8) {
                        Text(restaurant.cuisineType)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text(restaurant.priceLevel.symbol)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        if let distance = restaurant.distance {
                            Text(formatDistance(distance))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Spacer()

                // Trust score mini badge
                VStack {
                    Text("\(restaurant.trustScore.total)")
                        .font(.title.bold())
                        .foregroundStyle(restaurant.trustScore.level.color)
                    Text("Trust")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            // Safety badges
            HStack(spacing: 8) {
                if restaurant.isCeliacSafe {
                    SafetyBadge(icon: "checkmark.shield.fill", text: "Celiac Safe", color: .green)
                }

                SafetyBadge(
                    icon: restaurant.trustScore.level.icon,
                    text: restaurant.trustScore.level.rawValue,
                    color: restaurant.trustScore.level.color
                )
            }

            Divider()

            // Action buttons
            HStack(spacing: 12) {
                Button(action: onDirections) {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button(action: onViewDetails) {
                    Label("View Details", systemImage: "info.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
            }
        }
        .padding()
    }

    private func formatDistance(_ meters: Double) -> String {
        if meters < 1000 {
            return "\(Int(meters))m"
        } else {
            return String(format: "%.1fkm", meters / 1000)
        }
    }
}

struct SafetyBadge: View {
    let icon: String
    let text: String
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
            Text(text)
                .font(.caption.weight(.medium))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.15))
        .foregroundStyle(color)
        .clipShape(Capsule())
    }
}

// MARK: - Binding Extensions

extension Binding where Value == MapCameraPosition {
    func mapPosition(from region: MKCoordinateRegion) -> MapCameraPosition {
        .region(region)
    }
}

// MARK: - Preview

#Preview {
    MapView(
        store: Store(initialState: MapFeature.State()) {
            MapFeature()
        }
    )
}
