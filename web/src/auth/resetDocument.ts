/**
 * Full reload to the app root (spec §3.7 "Account switch"). Discards every Firestore listener,
 * the Firestore memory cache and all React state in this tab. A module of its own so tests can
 * replace it (jsdom does not implement navigation).
 */
export function resetDocument(): void {
  window.location.replace("/");
}
