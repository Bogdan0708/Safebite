import type { DeviceCleaner } from "../device/cleanup";
import type { Claim, CollectionState, Note, Restaurant } from "../records/types";
import { announceInvalidation } from "./signals";
import { COPY_DB_NAME, COPY_DB_VERSION, type CopyData, type CopyIdentity, type CopyMeta, type CopyToken, type ReadCopyResult, type ReplaceResult, type RestaurantData } from "./types";

/**
 * The offline copy (spec §3.9 "Data model", "Units" 1). IndexedDB only — never import Firebase
 * here (review P2-5). One connection per operation, closed on completion and on versionchange.
 * Every replacement is one readwrite transaction that re-checks the epoch, the opt-in, the copy's
 * identity and its revision before writing, so cleanup and newer work always win (review P3-13, R2-2).
 */

const RECORD_STORES = ["restaurants", "claims", "collection", "notes"] as const;
const ALL_STORES = ["meta", ...RECORD_STORES, "optIn", "control"];
const META_KEY = "copy";
const EPOCH_KEY = "epoch";

interface ChildRow<T> { rid: string; id: string; value: T }
interface StateRow { rid: string; value: CollectionState }

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(COPY_DB_NAME, COPY_DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("meta");
      db.createObjectStore("control");
      db.createObjectStore("restaurants", { keyPath: "id" });
      db.createObjectStore("claims", { keyPath: ["rid", "id"] });
      db.createObjectStore("collection", { keyPath: "rid" });
      db.createObjectStore("notes", { keyPath: ["rid", "id"] });
      db.createObjectStore("optIn", { keyPath: "uid" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("offline copy database blocked"));
  });
}

async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException("aborted", "AbortError"));
  });
}

function isQuota(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === "QuotaExceededError";
}

function isMeta(value: unknown): value is CopyMeta {
  const m = value as Partial<CopyMeta> | null;
  return !!m && typeof m.uid === "string" && typeof m.householdId === "string" && typeof m.displayName === "string"
    && typeof m.revision === "number" && typeof m.downloadedAt === "number" && typeof m.membershipCheckedAt === "number" && m.complete === true;
}

function ridRange(rid: string): IDBKeyRange {
  return IDBKeyRange.bound([rid, ""], [rid, "￿"]);
}

/** Firestore's default string order (code units), as the live `orderBy("name")` query. */
function byName(a: Restaurant, b: Restaurant): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1;
}

function newestFirst(a: Note, b: Note): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export async function readToken(): Promise<CopyToken> {
  if (!hasIndexedDb()) return { epoch: 0, revision: 0 };
  return withDb(async (db) => {
    const tx = db.transaction(["control", "meta"], "readonly");
    const control = (await result(tx.objectStore("control").get(EPOCH_KEY))) as { epoch?: unknown } | undefined;
    const meta = (await result(tx.objectStore("meta").get(META_KEY))) as Partial<CopyMeta> | undefined;
    return { epoch: typeof control?.epoch === "number" ? control.epoch : 0, revision: typeof meta?.revision === "number" ? meta.revision : 0 };
  });
}

export async function readMeta(): Promise<CopyMeta | null> {
  if (!hasIndexedDb()) return null;
  try {
    return await withDb(async (db) => {
      const value = await result(db.transaction("meta", "readonly").objectStore("meta").get(META_KEY));
      return isMeta(value) ? value : null;
    });
  } catch {
    return null;
  }
}

/** True when a meta record exists but has the wrong shape (readMeta reports it as null). */
export async function hasMalformedMeta(): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    return await withDb(async (db) => {
      const value = await result(db.transaction("meta", "readonly").objectStore("meta").get(META_KEY));
      return value !== undefined && !isMeta(value);
    });
  } catch {
    return false;
  }
}

export async function readCopy(id: CopyIdentity): Promise<ReadCopyResult> {
  if (!hasIndexedDb()) return { kind: "none" };
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(["meta", ...RECORD_STORES], "readonly");
      const raw = await result(tx.objectStore("meta").get(META_KEY));
      if (raw === undefined) return { kind: "none" } as const;
      if (!isMeta(raw)) return { kind: "malformed" } as const;
      if (raw.uid !== id.uid || raw.householdId !== id.householdId) return { kind: "none" } as const;
      const restaurants = (await result(tx.objectStore("restaurants").getAll())) as Restaurant[];
      const claimRows = (await result(tx.objectStore("claims").getAll())) as Array<ChildRow<Claim>>;
      const noteRows = (await result(tx.objectStore("notes").getAll())) as Array<ChildRow<Note>>;
      const stateRows = (await result(tx.objectStore("collection").getAll())) as StateRow[];
      if (!restaurants.every((r) => typeof r?.id === "string" && typeof r.name === "string" && r.createdAt instanceof Date)) return { kind: "malformed" } as const;
      const data: CopyData = { restaurants: [...restaurants].sort(byName), claims: {}, collection: {}, notes: {} };
      for (const row of claimRows) (data.claims[row.rid] ??= []).push(row.value);
      for (const row of noteRows) (data.notes[row.rid] ??= []).push(row.value);
      for (const list of Object.values(data.notes)) list.sort(newestFirst);
      for (const row of stateRows) data.collection[row.rid] = row.value;
      return { kind: "copy", meta: raw, data } as const;
    });
  } catch {
    return { kind: "none" };
  }
}

/** Checks inside a readwrite transaction that also has `control`, `optIn` and `meta` in scope. */
async function check(tx: IDBTransaction, id: CopyIdentity, expected: CopyToken, requireCopy: boolean): Promise<"ok" | ReplaceResult> {
  const control = (await result(tx.objectStore("control").get(EPOCH_KEY))) as { epoch?: unknown } | undefined;
  const epoch = typeof control?.epoch === "number" ? control.epoch : 0;
  if (epoch !== expected.epoch) return "cleared";
  if ((await result(tx.objectStore("optIn").get(id.uid))) === undefined) return "optedOut";
  const meta = (await result(tx.objectStore("meta").get(META_KEY))) as Partial<CopyMeta> | undefined;
  if (meta && (meta.uid !== id.uid || meta.householdId !== id.householdId)) return "otherCopy";
  if (requireCopy && !isMeta(meta)) return "noCopy";
  const revision = typeof meta?.revision === "number" ? meta.revision : 0;
  if (revision !== expected.revision) return "stale";
  return "ok";
}

async function abort(tx: IDBTransaction, done: Promise<void>): Promise<void> {
  try {
    tx.abort();
  } catch {
    // already finished
  }
  await done.catch(() => {});
}

function putRestaurant(tx: IDBTransaction, rid: string, claims: Claim[], notes: Note[], state: CollectionState | null): void {
  for (const c of claims) tx.objectStore("claims").put({ rid, id: c.id, value: c } satisfies ChildRow<Claim>);
  for (const n of notes) tx.objectStore("notes").put({ rid, id: n.id, value: n } satisfies ChildRow<Note>);
  if (state) tx.objectStore("collection").put({ rid, value: state } satisfies StateRow);
}

export async function replaceCopy(id: CopyIdentity & { displayName: string }, expected: CopyToken, data: CopyData, now: number): Promise<ReplaceResult> {
  if (!hasIndexedDb()) return "unavailable";
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(ALL_STORES, "readwrite");
      const done = finished(tx);
      const verdict = await check(tx, id, expected, false);
      if (verdict !== "ok") {
        await abort(tx, done);
        return verdict;
      }
      try {
        for (const name of RECORD_STORES) tx.objectStore(name).clear();
        for (const r of data.restaurants) {
          tx.objectStore("restaurants").put(r);
          putRestaurant(tx, r.id, data.claims[r.id] ?? [], data.notes[r.id] ?? [], data.collection[r.id] ?? null);
        }
        const meta: CopyMeta = { uid: id.uid, householdId: id.householdId, displayName: id.displayName, revision: expected.revision + 1, downloadedAt: now, membershipCheckedAt: now, complete: true };
        tx.objectStore("meta").put(meta, META_KEY); // written last
      } catch (err) {
        await abort(tx, done);
        throw err;
      }
      await done;
      return "written";
    });
  } catch (err) {
    return isQuota(err) ? "storageFull" : "unavailable";
  }
}

/** Partial refresh after a write: one restaurant, `null` when it no longer exists. Keeps downloadedAt. */
export async function replaceRestaurant(id: CopyIdentity, expected: CopyToken, rid: string, data: RestaurantData | null): Promise<ReplaceResult> {
  if (!hasIndexedDb()) return "unavailable";
  try {
    return await withDb(async (db) => {
      const tx = db.transaction(ALL_STORES, "readwrite");
      const done = finished(tx);
      const verdict = await check(tx, id, expected, true);
      if (verdict !== "ok") {
        await abort(tx, done);
        return verdict;
      }
      try {
        const meta = (await result(tx.objectStore("meta").get(META_KEY))) as CopyMeta;
        tx.objectStore("claims").delete(ridRange(rid));
        tx.objectStore("notes").delete(ridRange(rid));
        tx.objectStore("collection").delete(rid);
        tx.objectStore("restaurants").delete(rid);
        if (data) {
          tx.objectStore("restaurants").put(data.restaurant);
          putRestaurant(tx, rid, data.claims, data.notes, data.state);
        }
        tx.objectStore("meta").put({ ...meta, revision: meta.revision + 1 } satisfies CopyMeta, META_KEY);
      } catch (err) {
        await abort(tx, done);
        throw err;
      }
      await done;
      return "written";
    });
  } catch (err) {
    return isQuota(err) ? "storageFull" : "unavailable";
  }
}

/** Renews the 30-day window. Writes only when meta exists and matches both ids; never creates it. */
export async function recordMembershipCheck(id: CopyIdentity, now: number): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await withDb(async (db) => {
      const tx = db.transaction("meta", "readwrite");
      const done = finished(tx);
      const meta = await result(tx.objectStore("meta").get(META_KEY));
      if (isMeta(meta) && meta.uid === id.uid && meta.householdId === id.householdId) {
        tx.objectStore("meta").put({ ...meta, membershipCheckedAt: now } satisfies CopyMeta, META_KEY);
      }
      await done;
    });
  } catch {
    // The window is simply not renewed.
  }
}

/** One transaction: bump the epoch, delete meta and every record. Leaves opt-ins. Throws on failure. */
export async function clearCopy(): Promise<void> {
  if (!hasIndexedDb()) return;
  await withDb(async (db) => {
    const tx = db.transaction(["control", "meta", ...RECORD_STORES], "readwrite");
    const done = finished(tx);
    const control = (await result(tx.objectStore("control").get(EPOCH_KEY))) as { epoch?: unknown } | undefined;
    const epoch = typeof control?.epoch === "number" ? control.epoch : 0;
    tx.objectStore("control").put({ epoch: epoch + 1 }, EPOCH_KEY);
    tx.objectStore("meta").delete(META_KEY);
    for (const name of RECORD_STORES) tx.objectStore(name).clear();
    await done;
  });
  announceInvalidation();
}

export async function getOptIn(uid: string): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  try {
    return await withDb(async (db) => (await result(db.transaction("optIn", "readonly").objectStore("optIn").get(uid))) !== undefined);
  } catch {
    return false;
  }
}

/** Throws when storage is unavailable, so the switch can say "This device can't store an offline copy." */
export async function setOptIn(uid: string, enabled: boolean): Promise<void> {
  if (!hasIndexedDb()) throw new Error("IndexedDB unavailable");
  await withDb(async (db) => {
    const tx = db.transaction("optIn", "readwrite");
    const done = finished(tx);
    if (enabled) tx.objectStore("optIn").put({ uid, enabled: true });
    else tx.objectStore("optIn").delete(uid);
    await done;
  });
}

export async function clearAllOptIns(): Promise<void> {
  if (!hasIndexedDb()) return;
  await withDb(async (db) => {
    const tx = db.transaction("optIn", "readwrite");
    const done = finished(tx);
    tx.objectStore("optIn").clear();
    await done;
  });
}

/** Registered in device/registerCleaners.ts. Touches only the safebite-offline database. */
export const offlineCopyCleaner: DeviceCleaner = {
  name: "offlineCopy",
  async clear() {
    await clearCopy();
    await clearAllOptIns();
  },
};
