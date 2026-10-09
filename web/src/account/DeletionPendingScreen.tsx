import { useAuth } from "../auth/AuthProvider";
import { DeletePasswordForm } from "./DeletePasswordForm";

export function DeletionPendingScreen() {
  const { state, signOut } = useAuth();
  return (
    <main className="screen" data-testid="deletion-pending">
      <h1>Finish deleting your account</h1>
      <p>Your account deletion didn't finish. Enter your password to finish it.</p>
      {state.status === "deletionPending" && <DeletePasswordForm submitLabel="Finish deleting your account" testid="pending" expectedUid={state.uid} />}
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
