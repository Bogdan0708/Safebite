import { registerSW } from "virtual:pwa-register";

/**
 * Removes every service worker registration for this origin. Called when the bundle is
 * misconfigured so a previously installed worker cannot keep serving a stale shell.
 */
export async function unregisterServiceWorkers(): Promise<number> {
  if (!("serviceWorker" in navigator)) return 0;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  return registrations.length;
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
