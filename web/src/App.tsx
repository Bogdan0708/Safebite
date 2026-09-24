import { BrowserRouter } from "react-router";
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
    case "notMember":
      return <NotInvitedScreen />;
    case "error":
      return <MembershipErrorScreen />;
    case "member":
      return <AppShell />;
  }
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
          <Gate />
        </AuthProvider>
      </div>
    </BrowserRouter>
  );
}
