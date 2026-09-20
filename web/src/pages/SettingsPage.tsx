import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

interface WhoAmI {
  uid: string;
  householdId: string;
  displayName: string;
}

export function SettingsPage() {
  const { state, signOut } = useAuth();
  const [whoami, setWhoami] = useState<WhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const call = httpsCallable<unknown, WhoAmI>(functions, "whoami");
    call({})
      .then((res) => {
        if (active) setWhoami(res.data);
      })
      .catch(() => {
        if (active) setError("Could not confirm membership with the server.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <h2>Settings</h2>
      {state.status === "member" && <p>Signed in as {state.email}</p>}
      {whoami && (
        <p data-testid="whoami">
          Server confirms: {whoami.displayName} in household “{whoami.householdId}”.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}
