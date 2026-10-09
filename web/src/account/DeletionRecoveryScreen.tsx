import { signOut } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../firebase";
import { DeletePasswordForm } from "./DeletePasswordForm";
import { finishDeleted } from "./deleteFlow";
import { checkDeletion, recoveryView, type RecoveryView } from "./recovery";
import { clearDeletionRequest, type DeletionRequest } from "./storage";

/**
 * Rendered ahead of every auth state while sessionStorage holds a deletion request id (spec §3.8),
 * so it survives the reset reload any sign-out causes. Only the server's receipt decides.
 */
export function DeletionRecoveryScreen({ request, onDismiss }: { request: DeletionRequest; onDismiss: () => void }) {
  const [view, setView] = useState<RecoveryView | "checking" | "finishing" | "cleanupPending">("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const generation = useRef(0);

  const check = useCallback(() => {
    const mine = ++generation.current;
    const latest = () => generation.current === mine;
    setView("checking");
    void (async () => {
      const result = await checkDeletion(request.requestId);
      await auth.authStateReady();
      if (!latest()) return; // a newer check superseded this one
      const current = auth.currentUser;
      const next = recoveryView(result, request.uid, current?.uid ?? null);
      setEmail(current?.email ?? null);
      setConfirmed(result.ok && result.status === "complete");
      if (next === "success") {
        setView("finishing"); // never claim "deleted" before finishDeleted says so
        const finished = await finishDeleted(request.uid);
        if (latest()) setView(finished === "finished" ? "success" : finished === "cleanupPending" ? "cleanupPending" : "otherAccount");
        return;
      }
      setView(next);
    })();
  }, [request.requestId, request.uid]);
  useEffect(check, [check]);
  useEffect(() => () => { generation.current += 1; }, []);

  const proceed = () => { clearDeletionRequest(); onDismiss(); };

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
      {view === "finishing" && <p data-testid="recovery-finishing">Finishing…</p>}
      {view === "cleanupPending" && (
        <section role="status">
          <p>The account deletion is confirmed. We couldn't finish clearing its saved sign-in on this device.</p>
          <button type="button" onClick={check}>Try again</button>
        </section>
      )}
      {view === "success" && <p data-testid="recovery-success">Your account has been deleted.</p>}
      {view === "otherAccount" && (
        <section data-testid="recovery-other-account">
          {confirmed && <p data-testid="recovery-confirmed">That account's deletion is confirmed.</p>}
          <p>This deletion request belongs to another account. Nothing will be deleted from this one.</p>
          <button type="button" data-testid="recovery-continue" onClick={proceed}>Continue as this account</button>
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
      {view === "confirmationUnavailable" && (
        <section data-testid="recovery-unavailable">
          <p>We can't confirm what happened to this deletion request. The confirmation may have expired.</p>
          <button type="button" data-testid="recovery-continue" onClick={proceed}>Continue</button>
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
      {view === "unfinishedSignedIn" && (
        <section data-testid="recovery-unfinished">
          <p>Your account deletion didn't finish.</p>
          <p data-testid="recovery-account">Signed in as {email ?? "an unknown account"}</p>
          {/* recoveryView returns this view only when request.uid equals the signed-in uid, so it is non-null here. */}
          <DeletePasswordForm submitLabel="Finish deleting" testid="finish" expectedUid={request.uid!} />
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
      {view === "unfinishedSignedOut" && (
        <section data-testid="recovery-unfinished">
          <p>Your account deletion didn't finish. Sign in to that account to finish it.</p>
          <button type="button" data-testid="recovery-signin" onClick={proceed}>Sign in</button>
        </section>
      )}
      {view === "uncertain" && (
        <section data-testid="recovery-uncertain">
          <p>We couldn't confirm whether your account was deleted.</p>
          <p>If this doesn't clear, sign in again.</p>
          <button type="button" data-testid="recovery-check-again" onClick={check}>Check again</button>
          <button type="button" data-testid="recovery-signout" onClick={() => void leave()}>Sign out</button>
        </section>
      )}
    </main>
  );
}
