import { useAuth } from "../auth/AuthProvider";
import { DeletePasswordForm } from "./DeletePasswordForm";

export function DeletionPendingScreen() {
  const { signOut } = useAuth();
  return (
    <main className="screen" data-testid="deletion-pending">
      <h1>Finish deleting your account</h1>
      <p>Your account deletion didn't finish. Enter your password to finish it.</p>
      <DeletePasswordForm submitLabel="Finish deleting your account" testid="pending" />
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
