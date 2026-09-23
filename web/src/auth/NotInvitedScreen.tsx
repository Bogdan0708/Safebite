import { useAuth } from "./AuthProvider";

export function NotInvitedScreen() {
  const { state, signOut } = useAuth();
  const email = state.status === "notMember" ? state.email : null;
  return (
    <main className="screen" data-testid="not-invited">
      <h1>Not invited</h1>
      <p>
        {email ? <>The account <strong>{email}</strong> is signed in, but it is not a member of this household.</> : <>This account is not a member of this household.</>}
      </p>
      <p>SafeBite is private. Membership is set up by the household owner, not from this screen.</p>
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
