/**
 * Device-wide record of accounts this device has seen deleted (spec §3.8 step 4, amended after the
 * final review). Completion never signs out: Firebase signOut queues a "no user" update that can
 * land after another tab's queued sign-in and remove it. A deleted account's session instead stays
 * recognised here and is kept out of the app; signing in replaces it. Mirrored into
 * sessionStorage for a tab whose localStorage is blocked; readers take the union.
 */
export const DELETED_UIDS_KEY = "safebite.deletedUids";
export const MAX_DELETED_UIDS = 10;

type Store = "localStorage" | "sessionStorage";
const STORES: readonly Store[] = ["localStorage", "sessionStorage"];

function read(store: Store): string[] {
  try {
    const raw = window[store].getItem(DELETED_UIDS_KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

/** Each store is rebuilt from its OWN list, so a tab's stale mirror cannot resurrect a forgotten uid. */
function update(change: (list: string[]) => string[]): void {
  for (const store of STORES) {
    try {
      const next = [...new Set(change(read(store)))].slice(0, MAX_DELETED_UIDS);
      window[store].setItem(DELETED_UIDS_KEY, JSON.stringify(next));
    } catch { /* blocked */ }
  }
}

export function deletedUids(): string[] {
  return [...new Set([...read("localStorage"), ...read("sessionStorage")])];
}

export function isDeletedUid(uid: string): boolean {
  return deletedUids().includes(uid);
}

export function recordDeletedUid(uid: string): void {
  update((list) => [uid, ...list.filter((x) => x !== uid)]);
}

export function forgetDeletedUid(uid: string): void {
  update((list) => list.filter((x) => x !== uid));
}
