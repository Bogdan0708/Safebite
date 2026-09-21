import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startupProblems } from "./config/firebaseEnv";
import { LoadFailedScreen } from "./LoadFailedScreen";
import { MisconfiguredScreen } from "./MisconfiguredScreen";
import { purgeServiceWorkerState, registerServiceWorker } from "./pwa/serviceWorker";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

// Decided before anything imports Firebase. A misconfigured bundle renders the screen, removes
// any service worker left by an earlier install, and never loads the app chunk at all.
const problems = startupProblems(import.meta.env, __SAFEBITE_BUILD__);

if (problems.length > 0) {
  root.render(<MisconfiguredScreen problems={problems} />);
  // Purge lookups can be refused by the browser (e.g. a locked-down profile); the screen is
  // already rendered either way. A document still controlled by the old worker reloads once,
  // uncontrolled, so no cached release can be served to it; after the reload there is no
  // registration, so this cannot loop.
  purgeServiceWorkerState()
    .then(({ wasControlled }) => {
      if (wasControlled) window.location.reload();
    })
    .catch(() => {});
} else {
  void import("./App")
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
      registerServiceWorker();
    })
    .catch(() => root.render(<LoadFailedScreen />));
}
