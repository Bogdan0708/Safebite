import { registerSW } from "virtual:pwa-register";

export interface PurgeResult {
  registrations: number;
  caches: number;
  /** True when a worker controlled this document at the time of the purge (unregistering does not end that). */
  wasControlled: boolean;
}

/**
 * Removes every service worker registration and every Cache Storage cache for this origin.
 * Called when the bundle is misconfigured, so neither a previously installed worker nor its
 * precached release can keep serving a stale shell. Unregistering leaves the current document
 * under the old worker's control until the next navigation; the caller reloads once if
 * `wasControlled` is true. SafeBite owns this origin, so deleting all caches is correct.
 */
export async function purgeServiceWorkerState(): Promise<PurgeResult> {
  const result: PurgeResult = { registrations: 0, caches: 0, wasControlled: false };
  if ("serviceWorker" in navigator) {
    result.wasControlled = navigator.serviceWorker.controller !== null;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    result.registrations = registrations.length;
  }
  if ("caches" in globalThis) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    result.caches = names.length;
  }
  return result;
}

/**
 * Registers the generated service worker. Only src/main.tsx calls this, and only after
 * startupProblems() returned nothing, so a misconfigured bundle is never precached.
 * Outside a built bundle there is no worker to register.
 */
export function registerServiceWorker(): void {
  if (!__SAFEBITE_BUILD__ || !("serviceWorker" in navigator)) return;
  registerSW({ immediate: true });
}
