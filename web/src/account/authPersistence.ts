import { snapshotAuthGuards, retireConfirmedAuthGuards } from "./authCleanupGuard";
import { readDeletionRequest } from "./storage";
import { deletedUids } from "./deletedSessions";
import { removePersistedUsersIfUids } from "./persistedSession";

// Fail closed even if a module imports firebase.ts without going through main.tsx.
let allowed = false;
export function persistentAuthAllowed(): boolean { return allowed; }

/** Run before importing ANY module that initializes Firebase Auth. Never touches the old
 * localStorage Auth key, including migration: a concurrent legacy tab may be replacing it.
 * If cleanup cannot finish, this document uses memory only. A later navigation retries.
 * Until cleanup succeeds the guard remains durable across navigation and other tabs.
 */
export async function prepareAuthPersistence(): Promise<void> {
  allowed = false;
  try {
    // Shared tombstones are required for persistent Auth. If they cannot be read/written,
    // use memory rather than trusting a per-tab mirror to protect other documents.
    const probe = "safebite.authStorageProbe";
    localStorage.setItem(probe, probe);
    if (localStorage.getItem(probe) !== probe) return;
    localStorage.removeItem(probe);
    if (typeof indexedDB === "undefined") return;
    // Include legacy pending requests from before the durable guard was introduced.
    const pendingUid = readDeletionRequest()?.uid;
    const guards = snapshotAuthGuards();
    const confirmed = new Set([...deletedUids(), ...guards.filter(guard => guard.confirmed).map(guard => guard.uid)]);
    const uids = new Set([...guards.map(guard => guard.uid), ...confirmed, ...(pendingUid ? [pendingUid] : [])]);
    if (await removePersistedUsersIfUids(uids) === "unavailable") return;
    // Timeout/error paths keep every guard. Success retires only confirmed-deletion keys;
    // the bounded deleted-UID notice list remains as protection against an older tab's session.
    retireConfirmedAuthGuards(guards, confirmed);
    allowed = true;
  } catch { /* unavailable storage: memory-only sign-in */ }
}
