import { signOut } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { auth } from "../firebase";
import { DeletePasswordForm } from "./DeletePasswordForm";
import { finishDeleted } from "./deleteFlow";
import { checkDeletion, recoveryView, type RecoveryView } from "./recovery";
import { clearDeletionRequest } from "./storage";

/**
 * Rendered ahead of every auth state while sessionStorage holds a deletion request id (spec §3.8),
 * so it survives the reset reload any sign-out causes. Only the server's receipt decides.
 */
export function DeletionRecoveryScreen({ requestId, onDismiss }: { requestId: string; onDismiss: () => void }) {
  const [view, setView] = useState<RecoveryView | "checking">("checking");
  const [email, setEmail] = useState<string | null>(null);

  const check = useCallback(() => {
    setView("checking");
    void (async () => {
      const result = await checkDeletion(requestId);
      await auth.authStateReady();
      const next = recoveryView(result, auth.currentUser !== null);
      setEmail(auth.currentUser?.email ?? null);
      setView(next);
      if (next === "success") await finishDeleted();
    })();
  }, [requestId]);
  useEffect(check, [check]);

  const leave = async () => {
    clearDeletionRequest();
    if (auth.currentUser) {
      try { await signOut(auth); } catch { /* the tab is leaving recovery either way */ }
    }
    onDismiss();
  };

  return (
    <main className="screen">
      <h1>Account deletion</h1>
      {view === "checking" && <p data-testid="recovery-checking">Checking whether your account was deleted…</p>}
      {view === "success" && <p data-testid="recovery-success">Your account has been deleted.</p>}
      {view === "unfinishedSignedIn" && (
        <section data-testid="recovery-unfinished">
          <p>Your account deletion didn't finish.</p>
          <p data-testid="recovery-account">Signed in as {email ?? "an unknown account"}</p>
          <DeletePasswordForm submitLabel="Finish deleting" testid="finish" />
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
      {view === "unfinishedSignedOut" && (
        <section data-testid="recovery-unfinished">
          <p>Your account deletion didn't finish. Sign in to finish it.</p>
          <button type="button" data-testid="recovery-signin" onClick={() => { clearDeletionRequest(); onDismiss(); }}>Sign in</button>
        </section>
      )}
      {view === "uncertain" && (
        <section data-testid="recovery-uncertain">
          <p>We couldn't confirm whether your account was deleted.</p>
          <p>If this doesn't clear, sign in again. If your account still exists, you'll be offered to finish deleting it.</p>
          <button type="button" data-testid="recovery-check-again" onClick={check}>Check again</button>
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
    </main>
  );
}
