import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startupProblems } from "./config/firebaseEnv";
import { LoadFailedScreen } from "./LoadFailedScreen";
import { MisconfiguredScreen } from "./MisconfiguredScreen";
import { registerServiceWorker, unregisterServiceWorkers } from "./pwa/serviceWorker";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

// Decided before anything imports Firebase. A misconfigured bundle renders the screen, removes
// any service worker left by an earlier install, and never loads the app chunk at all.
const problems = startupProblems(import.meta.env, __SAFEBITE_BUILD__);

if (problems.length > 0) {
  // Registration lookup can itself be refused by the browser (e.g. a locked-down profile); the
  // misconfigured screen must still render either way.
  unregisterServiceWorkers().catch(() => {});
  root.render(<MisconfiguredScreen problems={problems} />);
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
