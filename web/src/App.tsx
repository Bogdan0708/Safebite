import { BrowserRouter } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SignInScreen } from "./auth/SignInScreen";
import { NotInvitedScreen } from "./auth/NotInvitedScreen";
import { AppShell } from "./AppShell";

function Gate() {
  const { state } = useAuth();
  switch (state.status) {
    case "loading":
      return <main className="screen"><p>Loading…</p></main>;
    case "signedOut":
      return <SignInScreen />;
    case "notMember":
      return <NotInvitedScreen />;
    case "member":
      return <AppShell />;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
