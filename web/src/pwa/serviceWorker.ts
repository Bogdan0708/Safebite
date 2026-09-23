import { registerSW } from "virtual:pwa-register";
import { updateAvailable, workerActivated } from "./updates";

export interface PurgeResult {
  /** Count of registrations successfully unregistered. Exists for tests and diagnostics. */
  registrations: number;
  /** Count of caches successfully deleted. Exists for tests and diagnostics. */
  caches: number;
  /** True when a worker controlled this document at the time of the purge (unregistering does not end that). */
  wasControlled: boolean;
  /** Count of rejected unregister()/delete() operations. Production only reads this and `wasControlled`. */
  failed: number;
}

/**
 * Removes every service worker registration and every Cache Storage cache for this origin.
 * Called when the bundle is misconfigured, so neither a previously installed worker nor its
 * precached release can keep serving a stale shell. Unregistering leaves the current document
 * under the old worker's control until the next navigation; the caller reloads once if
 * `wasControlled` is true. SafeBite owns this origin, so deleting all caches is correct.
 * Individual failures (a single rejected `unregister()` or `caches.delete()`) are tolerated:
 * every operation is attempted regardless of the others' outcome, and only the ones that
 * succeed are counted, so one failure cannot skip the cache purge or hide `wasControlled` from
 * the caller.
 */
export async function purgeServiceWorkerState(): Promise<PurgeResult> {
  const result: PurgeResult = { registrations: 0, caches: 0, wasControlled: false, failed: 0 };
  if ("serviceWorker" in navigator) {
    result.wasControlled = navigator.serviceWorker.controller !== null;
    const registrations = await navigator.serviceWorker.getRegistrations();
    const outcomes = await Promise.allSettled(registrations.map((registration) => registration.unregister()));
    result.registrations = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    result.failed += outcomes.filter((outcome) => outcome.status === "rejected").length;
  }
  if ("caches" in globalThis) {
    const names = await caches.keys();
    const outcomes = await Promise.allSettled(names.map((name) => caches.delete(name)));
    result.caches = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
    result.failed += outcomes.filter((outcome) => outcome.status === "rejected").length;
  }
  return result;
}

const RELOAD_FLAG = "safebite-purge-reloaded";
/** True the second time it is asked in a tab session: the purge reload happens at most once. */
export function alreadyReloadedForPurge(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === "1") return true;
    sessionStorage.setItem(RELOAD_FLAG, "1");
    return false;
  } catch {
    return true; // no storage → never reload rather than risk a loop
  }
}

/**
 * Registers the generated service worker in prompt mode. Only src/main.tsx calls this, and only
 * after startupProblems() returned nothing, so a misconfigured bundle is never precached.
 * A waiting worker surfaces as the update banner; `onNeedReload` fires in every tab once the new
 * worker controls it, and the store decides per tab whether to reload (see updates.ts).
 * Outside a built bundle there is no worker to register.
 */
export function registerServiceWorker(): void {
  if (!__SAFEBITE_BUILD__ || !("serviceWorker" in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      updateAvailable(() => update());
      // Belt-and-braces alongside onNeedReload below: the installed plugin (vite-plugin-pwa
      // 1.3.0) only calls onNeedReload when workbox-window's `isUpdate` bookkeeping is true, and
      // that flag is frozen at whatever `navigator.serviceWorker.controller` was at THIS PAGE'S
      // OWN first-ever registerSW() call (see
      // node_modules/vite-plugin-pwa/dist/client/build/register.js and
      // node_modules/workbox-window/Workbox.js:294) — it is never updated afterwards. A tab
      // whose first-ever visit installs the worker (no prior controller) therefore never gets
      // onNeedReload called for its own later, self-approved update (verified with a standalone
      // reproduction: onNeedReload never fired even though the new worker did take control). The
      // native `controllerchange` event is not subject to that bookkeeping and always fires when
      // this document's controller changes, so listen for it directly as the reliable signal.
      // Attached only here (once a real update is confirmed waiting), not unconditionally at
      // registration time, because the very first install's OWN claim of this page also fires a
      // native controllerchange, which is not an update. `{ once: true }` self-removes this
      // particular listener once it fires, but onNeedRefresh can itself be called more than once
      // before any controllerchange happens (the plugin re-invokes it for each "waiting"/
      // "installed as external" event), which would attach more than one such listener at a
      // time — that stacking is harmless, not prevented, because `workerActivated()` is
      // idempotent: repeat calls are a no-op once the store is already "activated", and a
      // requesting tab's repeat `reload()` call is likewise harmless (see updates.ts).
      navigator.serviceWorker.addEventListener("controllerchange", () => workerActivated(), { once: true });
    },
    onNeedReload: () => workerActivated(),
  });
}
