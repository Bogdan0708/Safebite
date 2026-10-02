import { auth } from "../firebase";

const IDB_TIMEOUT_MS = 1500;

export type PersistedRemoval = "removed" | "notOurs" | "unavailable";

const DB_NAME = "firebaseLocalStorageDb";
const STORE = "firebaseLocalStorage";

/**
 * Compare-and-delete of the Firebase Auth persisted user (spec §3.8 step 4). The SDK's start-up
 * reload of a stored user that no longer exists removes the SHARED persisted-user key whatever user
 * it then holds, which could be another account's just-signed-in session. Completion therefore
 * removes the deleted account's persisted user itself, in one IndexedDB transaction, and only when
 * the stored uid is requestUid's. Layout verified against firebase-js-sdk 1.13.6 in the dev
 * browser: database firebaseLocalStorageDb, store firebaseLocalStorage (keyPath fbase_key), record
 * { fbase_key, value: { uid, ... } }. Never throws.
 */
export async function removePersistedUserIfUid(uid: string): Promise<PersistedRemoval> {
  try {
    const key = `firebase:authUser:${auth.app.options.apiKey}:[DEFAULT]`;
    const local = removeFromLocalStorage(key, uid);
    const idb = await removeFromIndexedDb(key, uid);
    if (idb === "removed" || local === "removed") return "removed";
    if (idb === "notOurs" || local === "notOurs") return "notOurs";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

function removeFromLocalStorage(key: string, uid: string): PersistedRemoval {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return "unavailable";
    const stored = JSON.parse(raw) as { uid?: unknown } | null;
    if (stored?.uid !== uid) return "notOurs";
    localStorage.removeItem(key);
    return "removed";
  } catch {
    return "unavailable";
  }
}

function removeFromIndexedDb(key: string, uid: string): Promise<PersistedRemoval> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: PersistedRemoval) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    // A hung open (blocked by another tab, a stalled browser) must not hang completion.
    const timer = setTimeout(() => done("unavailable"), IDB_TIMEOUT_MS);
    try {
      const open = indexedDB.open(DB_NAME); // no version: never creates or upgrades the SDK's database
      open.onerror = () => done("unavailable");
      open.onblocked = () => done("unavailable");
      open.onupgradeneeded = () => {
        // The database did not exist: abort so that opening leaves nothing behind.
        open.transaction?.abort();
        done("unavailable");
      };
      open.onsuccess = () => {
        const db = open.result;
        // Already settled (timeout or onblocked): close and never touch the store.
        if (settled) { try { db.close(); } catch { /* ignore */ } return; }
        try {
          if (!db.objectStoreNames.contains(STORE)) { db.close(); done("unavailable"); return; }
          const tx = db.transaction(STORE, "readwrite");
          const store = tx.objectStore(STORE);
          let outcome: PersistedRemoval = "notOurs";
          tx.oncomplete = () => { db.close(); done(outcome); };
          tx.onerror = () => { db.close(); done("unavailable"); };
          tx.onabort = () => { db.close(); done("unavailable"); };
          const get = store.get(key);
          get.onsuccess = () => {
            const record = get.result as { value?: { uid?: unknown } } | undefined;
            if (record?.value?.uid === uid) {
              store.delete(key);
              outcome = "removed";
            }
          };
        } catch {
          try { db.close(); } catch { /* ignore */ }
          done("unavailable");
        }
      };
    } catch {
      done("unavailable");
    }
  });
}
