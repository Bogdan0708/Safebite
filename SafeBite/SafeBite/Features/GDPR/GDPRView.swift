import SwiftUI
import ComposableArchitecture

/// GDPR compliance view for data management and privacy settings
struct GDPRView: View {
    @Bindable var store: StoreOf<GDPRFeature>
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Info section
                infoSection

                // Consent settings
                consentSection

                // Data export
                exportSection

                // Data deletion
                deleteSection

                // Legal links
                legalSection
            }
            .navigationTitle("Privacy & Data")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Export Complete", isPresented: $store.showExportSuccess.sending(\.dismissExportSuccess)) {
                Button("Share") {
                    store.send(.shareExportTapped)
                }
                Button("OK", role: .cancel) {}
            } message: {
                Text("Your data has been exported successfully. You can share or save the file.")
            }
            .alert("Delete All Data", isPresented: $store.showDeleteConfirmation.sending(\.dismissDeleteConfirmation)) {
                TextField("Type DELETE to confirm", text: $store.deleteConfirmationText.sending(\.deleteConfirmationTextChanged))
                    .textInputAutocapitalization(.never)

                Button("Cancel", role: .cancel) {}
                Button("Delete Everything", role: .destructive) {
                    store.send(.deleteConfirmed)
                }
                .disabled(!store.canDelete)
            } message: {
                Text("This will permanently delete all your data including your account, saved restaurants, reviews, and preferences. This action cannot be undone.\n\nType DELETE to confirm.")
            }
            .alert("Data Deleted", isPresented: $store.showDeleteSuccess.sending(\.dismissDeleteSuccess)) {
                Button("OK") {
                    dismiss()
                }
            } message: {
                Text("All your data has been deleted. The app will now reset.")
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
            .sheet(isPresented: $store.showShareSheet.sending(\.dismissShareSheet)) {
                if let url = store.exportedFileURL {
                    ShareSheet(items: [url])
                }
            }
            .onAppear {
                store.send(.onAppear)
            }
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .font(.title)
                        .foregroundStyle(.green)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Your Privacy Matters")
                            .font(.headline)

                        Text("SafeBite is committed to protecting your data under GDPR.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Text("You have the right to access, export, and delete your personal data at any time. We only collect data necessary to provide our service.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
    }

    // MARK: - Consent Section

    private var consentSection: some View {
        Section {
            Toggle(isOn: $store.analyticsConsent.sending(\.analyticsConsentToggled)) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Analytics")
                        .font(.subheadline)
                    Text("Help us improve SafeBite with anonymous usage data")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(.green)

            Toggle(isOn: $store.personalizationConsent.sending(\.personalizationConsentToggled)) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Personalisation")
                        .font(.subheadline)
                    Text("Get restaurant recommendations based on your preferences")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(.green)

            Toggle(isOn: $store.marketingConsent.sending(\.marketingConsentToggled)) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Marketing Communications")
                        .font(.subheadline)
                    Text("Receive news, tips, and special offers")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(.green)
        } header: {
            Text("Data Preferences")
        } footer: {
            Text("You can change these settings at any time. Some features may be limited if you disable certain options.")
        }
    }

    // MARK: - Export Section

    private var exportSection: some View {
        Section {
            Button {
                store.send(.exportDataTapped)
            } label: {
                HStack {
                    Label("Export My Data", systemImage: "square.and.arrow.up")
                    Spacer()
                    if store.isLoading {
                        ProgressView()
                    } else {
                        Image(systemName: "chevron.right")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .disabled(store.isLoading)
        } header: {
            Text("Data Portability")
        } footer: {
            Text("Download a copy of all your personal data in JSON format. This includes your profile, saved restaurants, reviews, and preferences.")
        }
    }

    // MARK: - Delete Section

    private var deleteSection: some View {
        Section {
            Button(role: .destructive) {
                store.send(.deleteDataTapped)
            } label: {
                HStack {
                    Label("Delete All My Data", systemImage: "trash")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .foregroundStyle(.secondary)
                }
            }
            .disabled(store.isLoading)
        } header: {
            Text("Right to Erasure")
        } footer: {
            Text("Permanently delete your account and all associated data. This action cannot be undone and you will need to create a new account to use SafeBite again.")
        }
    }

    // MARK: - Legal Section

    private var legalSection: some View {
        Section {
            Link(destination: URL(string: "https://safebite.app/privacy")!) {
                HStack {
                    Label("Privacy Policy", systemImage: "doc.text")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Link(destination: URL(string: "https://safebite.app/terms")!) {
                HStack {
                    Label("Terms of Service", systemImage: "doc.text")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Link(destination: URL(string: "https://safebite.app/cookies")!) {
                HStack {
                    Label("Cookie Policy", systemImage: "doc.text")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("Legal")
        }
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - GDPR Consent Banner

struct GDPRConsentBanner: View {
    let onAcceptAll: () -> Void
    let onCustomize: () -> Void
    let onRejectNonEssential: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            // Icon and title
            HStack(spacing: 12) {
                Image(systemName: "hand.raised.fill")
                    .font(.title2)
                    .foregroundStyle(.green)

                Text("Your Privacy")
                    .font(.headline)

                Spacer()
            }

            // Description
            Text("SafeBite uses cookies and processes your data to provide our service, improve your experience, and show relevant content. You can customise your choices below.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            // Buttons
            VStack(spacing: 12) {
                Button {
                    onAcceptAll()
                } label: {
                    Text("Accept All")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.green)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                HStack(spacing: 12) {
                    Button {
                        onRejectNonEssential()
                    } label: {
                        Text("Essential Only")
                            .font(.subheadline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(.systemGray5))
                            .foregroundStyle(.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    Button {
                        onCustomize()
                    } label: {
                        Text("Customise")
                            .font(.subheadline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(.systemGray5))
                            .foregroundStyle(.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }

            // Links
            HStack(spacing: 16) {
                Link("Privacy Policy", destination: URL(string: "https://safebite.app/privacy")!)
                Link("Cookie Policy", destination: URL(string: "https://safebite.app/cookies")!)
            }
            .font(.caption)
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.1), radius: 10, y: 5)
    }
}

// MARK: - Preview

#Preview {
    GDPRView(
        store: Store(initialState: GDPRFeature.State()) {
            GDPRFeature()
        }
    )
}

#Preview("Consent Banner") {
    ZStack {
        Color.gray.opacity(0.3)
            .ignoresSafeArea()

        VStack {
            Spacer()
            GDPRConsentBanner(
                onAcceptAll: {},
                onCustomize: {},
                onRejectNonEssential: {}
            )
            .padding()
        }
    }
}
