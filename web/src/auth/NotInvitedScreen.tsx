import { useState } from "react";
import { DeletePasswordForm } from "../account/DeletePasswordForm";
import { useAuth } from "./AuthProvider";

export function NotInvitedScreen() {
  const { state, signOut } = useAuth();
  const email = state.status === "notMember" ? state.email : null;
  const canDelete = state.status === "notMember" && state.canDeleteSignIn;
  const uid = state.status === "notMember" ? state.uid : null;
  const [open, setOpen] = useState(false);
  return (
    <main className="screen" data-testid="not-invited">
      <h1>Not invited</h1>
      <p>
        {email ? <>The account <strong>{email}</strong> is signed in, but it is not a member of this household.</> : <>This account is not a member of this household.</>}
      </p>
      <p>SafeBite is private. Membership is set up by the household owner, not from this screen.</p>
      {canDelete && uid !== null && (
        <section>
          {open ? (
            <DeletePasswordForm submitLabel="Delete this sign-in" testid="delete-signin" expectedUid={uid} />
          ) : (
            <button type="button" data-testid="delete-signin-open" onClick={() => setOpen(true)}>Delete this sign-in</button>
          )}
        </section>
      )}
      <button data-testid="signout" type="button" onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
