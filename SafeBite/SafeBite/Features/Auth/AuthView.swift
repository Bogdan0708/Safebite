import SwiftUI
import ComposableArchitecture
import AuthenticationServices

/// Authentication view for sign in and sign up
struct AuthView: View {
    @Bindable var store: StoreOf<AuthFeature>
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo and header
                    headerSection

                    // Form
                    formSection

                    // Submit button
                    submitButton

                    // Divider
                    dividerSection

                    // Social sign in
                    socialSignInSection

                    // Toggle mode
                    toggleModeButton
                }
                .padding(24)
            }
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $store.showForgotPassword.sending(\.dismissForgotPassword)) {
                ForgotPasswordSheet(store: store)
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
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 16) {
            // App icon
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.15))
                    .frame(width: 80, height: 80)

                Image(systemName: "fork.knife.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.green)
            }

            VStack(spacing: 8) {
                Text(store.mode == .signIn ? "Welcome Back" : "Create Account")
                    .font(.title.bold())

                Text(store.mode == .signIn ?
                     "Sign in to access your saved restaurants" :
                     "Join the coeliac-safe dining community")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    // MARK: - Form

    private var formSection: some View {
        VStack(spacing: 16) {
            // Display name (sign up only)
            if store.mode == .signUp {
                AuthTextField(
                    icon: "person.fill",
                    placeholder: "Display Name",
                    text: $store.displayName.sending(\.displayNameChanged)
                )
            }

            // Email
            AuthTextField(
                icon: "envelope.fill",
                placeholder: "Email",
                text: $store.email.sending(\.emailChanged),
                keyboardType: .emailAddress,
                autocapitalization: .never
            )

            // Password
            AuthTextField(
                icon: "lock.fill",
                placeholder: "Password",
                text: $store.password.sending(\.passwordChanged),
                isSecure: true
            )

            // Confirm password (sign up only)
            if store.mode == .signUp {
                AuthTextField(
                    icon: "lock.fill",
                    placeholder: "Confirm Password",
                    text: $store.confirmPassword.sending(\.confirmPasswordChanged),
                    isSecure: true
                )

                if let error = store.passwordError {
                    HStack {
                        Image(systemName: "exclamationmark.circle.fill")
                            .font(.caption)
                        Text(error)
                            .font(.caption)
                    }
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            // Forgot password (sign in only)
            if store.mode == .signIn {
                Button {
                    store.send(.forgotPasswordTapped)
                } label: {
                    Text("Forgot Password?")
                        .font(.subheadline)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }

    // MARK: - Submit Button

    private var submitButton: some View {
        Button {
            store.send(.submitTapped)
        } label: {
            if store.isLoading {
                ProgressView()
                    .tint(.white)
            } else {
                Text(store.mode == .signIn ? "Sign In" : "Create Account")
                    .font(.headline)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(store.isFormValid ? Color.green : Color.gray)
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .disabled(!store.isFormValid || store.isLoading)
    }

    // MARK: - Divider

    private var dividerSection: some View {
        HStack {
            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .frame(height: 1)

            Text("or")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)

            Rectangle()
                .fill(Color.gray.opacity(0.3))
                .frame(height: 1)
        }
    }

    // MARK: - Social Sign In

    private var socialSignInSection: some View {
        VStack(spacing: 12) {
            // Apple Sign In
            SignInWithAppleButton(
                store.mode == .signIn ? .signIn : .signUp,
                onRequest: { request in
                    let appleRequest = AuthenticationService.shared.signInWithApple()
                    request.requestedScopes = appleRequest.requestedScopes
                    request.nonce = appleRequest.nonce
                },
                onCompletion: { result in
                    switch result {
                    case .success(let authorization):
                        Task {
                            do {
                                let user = try await AuthenticationService.shared.handleAppleSignIn(authorization: authorization)
                                store.send(.appleSignInCompleted(user))
                            } catch {
                                store.send(.authFailed(error.localizedDescription))
                            }
                        }
                    case .failure(let error):
                        if (error as NSError).code != ASAuthorizationError.canceled.rawValue {
                            store.send(.authFailed(error.localizedDescription))
                        }
                    }
                }
            )
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Toggle Mode

    private var toggleModeButton: some View {
        HStack(spacing: 4) {
            Text(store.mode == .signIn ? "Don't have an account?" : "Already have an account?")
                .foregroundStyle(.secondary)

            Button {
                store.send(.modeToggled)
            } label: {
                Text(store.mode == .signIn ? "Sign Up" : "Sign In")
                    .fontWeight(.semibold)
            }
        }
        .font(.subheadline)
    }
}

// MARK: - Auth Text Field

struct AuthTextField: View {
    let icon: String
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences
    var isSecure: Bool = false

    @State private var showPassword: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.secondary)
                .frame(width: 24)

            if isSecure && !showPassword {
                SecureField(placeholder, text: $text)
            } else {
                TextField(placeholder, text: $text)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(autocapitalization)
            }

            if isSecure {
                Button {
                    showPassword.toggle()
                } label: {
                    Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Forgot Password Sheet

struct ForgotPasswordSheet: View {
    @Bindable var store: StoreOf<AuthFeature>
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if store.forgotPasswordSent {
                    // Success state
                    VStack(spacing: 16) {
                        Image(systemName: "envelope.badge.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.green)

                        Text("Check Your Email")
                            .font(.title2.bold())

                        Text("We've sent password reset instructions to \(store.forgotPasswordEmail)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 40)

                    Spacer()

                    Button("Done") {
                        dismiss()
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.green)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                } else {
                    // Input state
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Enter your email address and we'll send you instructions to reset your password.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        AuthTextField(
                            icon: "envelope.fill",
                            placeholder: "Email",
                            text: $store.forgotPasswordEmail.sending(\.forgotPasswordEmailChanged),
                            keyboardType: .emailAddress,
                            autocapitalization: .never
                        )
                    }
                    .padding(.top, 20)

                    Spacer()

                    Button {
                        store.send(.sendResetEmailTapped)
                    } label: {
                        if store.isLoading {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Send Reset Link")
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(store.forgotPasswordEmail.isEmpty ? Color.gray : Color.green)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .disabled(store.forgotPasswordEmail.isEmpty || store.isLoading)
                }
            }
            .padding(24)
            .navigationTitle("Reset Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Preview

#Preview("Sign In") {
    AuthView(
        store: Store(initialState: AuthFeature.State(mode: .signIn)) {
            AuthFeature()
        }
    )
}

#Preview("Sign Up") {
    AuthView(
        store: Store(initialState: AuthFeature.State(mode: .signUp)) {
            AuthFeature()
        }
    )
}
