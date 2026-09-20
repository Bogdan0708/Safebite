import { useAuth } from "./AuthProvider";

export function MembershipErrorScreen() {
  const { state, retry, signOut } = useAuth();
  const message = state.status === "error" ? state.message : "Couldn't check your membership. Check your connection and try again.";
  return (
    <main className="screen" data-testid="membership-error">
      <h1>Couldn't check your membership</h1>
      <p>{message}</p>
      <button data-testid="retry" type="button" onClick={() => retry()}>Try again</button>
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
