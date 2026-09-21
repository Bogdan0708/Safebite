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
