import { useEffect, useRef, useState } from "react";
import { abortable, callable, isAbortError } from "../api/callable";
import { useAuth } from "../auth/AuthProvider";
import { ChangePasswordForm } from "./ChangePasswordForm";

interface WhoAmI {
  uid: string;
  householdId: string;
  displayName: string;
}

const whoami = callable<Record<string, never>, WhoAmI>("whoami");

export function SettingsPage() {
  const { state, signOut } = useAuth();
  const [confirmed, setConfirmed] = useState<WhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref so React StrictMode's mount → unmount → mount in development reuses the
  // in-flight request instead of issuing a second one. Refs survive that simulated remount.
  const request = useRef<Promise<WhoAmI> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    request.current ??= whoami({});
    abortable(request.current, controller.signal)
      .then(setConfirmed)
      .catch((err: unknown) => {
        if (!isAbortError(err)) setError("Could not confirm membership with the server.");
      });
    return () => controller.abort();
  }, []);

  return (
    <section>
      <h2>Settings</h2>
      {state.status === "member" && <p>Signed in as {state.email}</p>}
      {confirmed && (
        <p data-testid="whoami">
          Server confirms: {confirmed.displayName} in household “{confirmed.householdId}”.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <ChangePasswordForm />
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
