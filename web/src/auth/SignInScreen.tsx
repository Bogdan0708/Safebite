import { useState, type SubmitEvent } from "react";
import { useAuth } from "./AuthProvider";

function messageFor(code: string | undefined): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "No connection. Check your network and try again.";
    default:
      return "Sign-in failed. Try again.";
  }
}

export function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(messageFor((err as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <h1>SafeBite</h1>
      <p>Private gluten-free restaurant research. Sign in with your invited account.</p>
      <form data-testid="signin-form" onSubmit={onSubmit}>
        <label>
          Email
          <input data-testid="signin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input data-testid="signin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button data-testid="signin-submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p role="alert" data-testid="signin-error">{error}</p>}
      </form>
    </main>
  );
}
