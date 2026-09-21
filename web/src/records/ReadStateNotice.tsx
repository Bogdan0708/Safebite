import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { WatchState } from "./useWatch";

/** Renders the non-ready read states (spec §3.5). Returns null for `ready` so callers just render data. */
export function ReadStateNotice({ state, onRetry, gone }: { state: WatchState<unknown>; onRetry: () => void; gone?: ReactNode }) {
  const { signOut } = useAuth();
  switch (state.status) {
    case "loading":
      return <p data-testid="read-loading">Loading…</p>;
    case "offline":
      return (
        <p className="notice" role="status" data-testid="read-offline">
          Showing last loaded data — you are offline. Adding and editing need a connection.
        </p>
      );
    case "denied":
      return (
        <div className="notice" role="alert" data-testid="read-denied">
          <p>You no longer have access to this household.</p>
          <button type="button" data-testid="signout-denied" onClick={() => void signOut()}>Sign out</button>
        </div>
      );
    case "error":
      return (
        <div className="notice" role="alert" data-testid="read-error">
          <p>Could not load: {state.message}</p>
          <button type="button" data-testid="read-retry" onClick={onRetry}>Retry</button>
        </div>
      );
    case "gone":
      return <div className="notice" role="alert" data-testid="read-gone">{gone ?? <p>This restaurant was deleted.</p>}</div>;
    case "ready":
      return null;
  }
}
