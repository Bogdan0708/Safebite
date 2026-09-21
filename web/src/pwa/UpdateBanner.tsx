import { useSyncExternalStore } from "react";
import { applyUpdate, getUpdateState, subscribeToUpdates, type UpdateState } from "./updates";

const MESSAGES: Record<Exclude<UpdateState, "idle">, string> = {
  available: "A new version of SafeBite is ready.",
  activated: "SafeBite was updated in another tab. Reload when you are ready.",
};

/** Non-modal; rendered above every screen (App.tsx). Nothing reloads until Reload is tapped in this tab. */
export function UpdateBanner() {
  const state = useSyncExternalStore(subscribeToUpdates, getUpdateState, (): UpdateState => "idle");
  if (state === "idle") return null;
  return (
    <div className="banner" role="status" data-testid="update-banner" data-state={state}>
      <span>{MESSAGES[state]}</span>
      <button type="button" data-testid="update-reload" onClick={() => applyUpdate()}>
        Reload
      </button>
    </div>
  );
}
