import { firebaseConfig } from "../config/firebaseConfig";
import { CLEANER_TIMEOUT_MS } from "../device/cleanup";

// Liveness backstop on the OPEN only; shares the cleaner budget (web/src/device/cleanup.ts).
const IDB_OPEN_TIMEOUT_MS = CLEANER_TIMEOUT_MS;

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
export function removePersistedUserIfUid(uid: string): Promise<PersistedRemoval> {
  return removePersistedUsersIfUids(new Set([uid]));
}

/** One open and one transaction regardless of how many historical UIDs are guarded. */
export async function removePersistedUsersIfUids(uids: ReadonlySet<string>): Promise<PersistedRemoval> {
  if (uids.size === 0) return "notOurs";
  try {
    const key = `firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`;
    return await removeFromIndexedDb(key, uids);
  } catch {
    return "unavailable";
  }
}

function removeFromIndexedDb(key: string, uids: ReadonlySet<string>): Promise<PersistedRemoval> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: PersistedRemoval) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    // A hung open (blocked by another tab, a stalled browser) must not hang completion. The timer
    // covers the open only: a late open still performs the uid-checked delete (it can only ever
    // remove this uid's own record), and a started transaction settles only through its events.
    const timer = setTimeout(() => {
      console.warn("safebite: persisted-session removal timed out");
      done("unavailable");
    }, IDB_OPEN_TIMEOUT_MS);
    try {
      const open = indexedDB.open(DB_NAME); // no version: never creates or upgrades the SDK's database
      open.onerror = () => done("unavailable");
      open.onblocked = () => done("unavailable");
      open.onupgradeneeded = () => {
        // The database did not exist: abort so that opening leaves nothing behind.
        open.transaction?.abort();
        done("notOurs");
      };
      open.onsuccess = () => {
        clearTimeout(timer);
        const db = open.result;
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
            if (record !== undefined && typeof record?.value?.uid !== "string") {
              outcome = "unavailable"; // cannot prove whose session this unexpected layout holds
            } else if (typeof record?.value?.uid === "string" && uids.has(record.value.uid)) {
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
