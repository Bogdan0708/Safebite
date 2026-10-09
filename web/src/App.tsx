import { useState } from "react";
import { BrowserRouter } from "react-router";
import { readDeletionRequest } from "./account/storage";
import { DeletionRecoveryScreen } from "./account/DeletionRecoveryScreen";
import { DeletionPendingScreen } from "./account/DeletionPendingScreen";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SignInScreen } from "./auth/SignInScreen";
import { NotInvitedScreen } from "./auth/NotInvitedScreen";
import { MembershipErrorScreen } from "./auth/MembershipErrorScreen";
import { AppShell } from "./AppShell";
import { UpdateBanner } from "./pwa/UpdateBanner";

function Gate() {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <main className="screen"><p>Loading…</p></main>;
    case "resetting":
      return <main className="screen" data-testid="resetting"><p>Signing out…</p></main>;
    case "signedOut":
      return <SignInScreen />;
    case "deletedSession":
      return <SignInScreen deletedUid={state.uid} />;
    case "notMember":
      return <NotInvitedScreen />;
    case "deletionPending":
      return <DeletionPendingScreen />;
    case "error":
      return <MembershipErrorScreen />;
    case "member":
      return <AppShell />;
  }
}

/** A deletion request id in this tab means recovery comes before anything else (spec §3.8). */
function Root() {
  const [pending, setPending] = useState(() => readDeletionRequest());
  if (pending) return <DeletionRecoveryScreen request={pending} onDismiss={() => setPending(null)} />;
  return <Gate />;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Single 100dvh column so the banner (auto) and the screen below it (1fr) always sum to
          the viewport height — .shell no longer owns its own 100dvh, so the tab bar never gets
          pushed below the fold while the banner is up. Also the one place the top safe-area
          inset is applied (see styles.css); .banner and .shell-header no longer add it. */}
      <div className="app-frame">
        <UpdateBanner />
        <AuthProvider>
          <Root />
        </AuthProvider>
      </div>
    </BrowserRouter>
  );
}
