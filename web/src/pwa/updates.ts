/**
 * Update-prompt state shared between the service-worker registration (src/pwa/serviceWorker.ts)
 * and the banner (UpdateBanner.tsx). Module-level so it exists before React renders.
 *
 * Lifecycle in `registerType: "prompt"`:
 *   idle → available   a new worker is installed and waiting (plugin `onNeedRefresh`)
 *   available → (Reload tapped) → `updateServiceWorker()` tells the waiting worker to skip waiting
 *   any → `onNeedReload` fires in EVERY open tab once the new worker controls them (audit F5
 *         reproduced that the plugin's default handler reloads them all). Only the tab that tapped
 *         Reload (`requestedHere`) reloads; the others move to `activated` and keep running their
 *         old code — safe because the app loads no lazy chunk after boot — until they tap Reload.
 * Misconfiguration recovery (src/main.tsx purge + one-shot reload) is separate and unaffected.
 */
export type UpdateState = "idle" | "available" | "activated";

type Listener = () => void;

let state: UpdateState = "idle";
let updater: (() => Promise<void>) | null = null;
let requestedHere = false;
const listeners = new Set<Listener>();

function setState(next: UpdateState): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeToUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUpdateState(): UpdateState {
  return state;
}

/** A new worker is waiting. `update` is the function returned by the plugin's registerSW(). */
export function updateAvailable(update: () => Promise<void>): void {
  updater = update;
  if (state === "idle") setState("available");
}

/** The new worker now controls this tab. Reload only if this tab asked for it. */
export function workerActivated(reload: () => void = () => window.location.reload()): void {
  if (requestedHere) {
    reload();
    return;
  }
  setState("activated");
}

/** The banner's Reload button. */
export function applyUpdate(reload: () => void = () => window.location.reload()): void {
  if (state === "available" && updater) {
    requestedHere = true;
    void updater();
    return;
  }
  if (state === "activated") reload();
}

export function resetUpdatesForTests(): void {
  state = "idle";
  updater = null;
  requestedHere = false;
  listeners.clear();
}
