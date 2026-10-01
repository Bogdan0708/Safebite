import {
  collection,
  deleteField,
  doc,
  getDocsFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentSnapshot,
  type FirestoreError,
  type Transaction,
} from "firebase/firestore";
import { db } from "../firebase";
import { fromCalendarDate, toCalendarDate } from "./dates";
import type { Author, Claim, ClaimInput, ClaimSource, Restaurant, RestaurantInput } from "./types";

/**
 * The only module that talks to Firestore for records (spec §3.5 "Online-only writes and read
 * states"). Every write is a runTransaction: transactions need the server, are never queued
 * offline, and are not applied to the local cache before commit, so snapshots never show
 * pending data and "ok" means the server accepted it. Listeners report where their data came
 * from so the UI can say "offline" instead of pretending a cached copy is current.
 */

export type Snapshot<T> =
  | { status: "ready" | "offline"; value: T }
  | { status: "gone" }
  | { status: "denied" }
  | { status: "error"; message: string };

export type WriteOutcome<T = void> =
  | { kind: "ok"; value: T }
  | { kind: "conflict" }
  | { kind: "notFound" }
  | { kind: "permission" }
  | { kind: "offline" }
  | { kind: "failed"; message: string };

export type DeleteStep = "marking" | "sweeping" | "sweepingNotes" | "removing";

/** Documents deleted per transaction during a sweep (well under Firestore's per-transaction limit). */
export const SWEEP_PAGE = 100;

// The helpers below are exported for the sibling record modules (collection.ts, notes.ts) only.
export class ConflictError extends Error {}
export class NotFoundError extends Error {}

const restaurantsCol = (hid: string) => collection(db, "households", hid, "restaurants");
export const restaurantRef = (hid: string, rid: string) => doc(db, "households", hid, "restaurants", rid);
const claimsCol = (hid: string, rid: string) => collection(db, "households", hid, "restaurants", rid, "claims");
export const notesCol = (hid: string, rid: string) => collection(db, "households", hid, "restaurants", rid, "notes");
export const collectionRef = (hid: string, rid: string) => doc(db, "households", hid, "collection", rid);

export function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

export function toRestaurant(snap: DocumentSnapshot): Restaurant {
  const d = snap.data() as DocumentData;
  const r: Restaurant = {
    id: snap.id,
    name: String(d.name),
    address: String(d.address),
    createdBy: String(d.createdBy),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    version: Number(d.version),
    deleting: d.deleting === true,
  };
  if (typeof d.phone === "string") r.phone = d.phone;
  if (typeof d.website === "string") r.website = d.website;
  if (typeof d.lat === "number" && typeof d.lng === "number") {
    r.lat = d.lat;
    r.lng = d.lng;
  }
  if (typeof d.googlePlaceId === "string") r.googlePlaceId = d.googlePlaceId;
  return r;
}

export function toClaim(snap: DocumentSnapshot): Claim {
  const d = snap.data() as DocumentData;
  const source = d.source as ClaimSource;
  const c: Claim = {
    id: snap.id,
    kind: d.kind,
    value: d.value,
    detail: typeof d.detail === "string" ? d.detail : "",
    source: typeof source.url === "string" ? { type: source.type, label: source.label, url: source.url } : { type: source.type, label: source.label },
    checkedAt: toCalendarDate(d.checkedAt as Timestamp),
    authorUid: String(d.authorUid),
    authorName: String(d.authorName),
    createdAt: toDate(d.createdAt),
  };
  if (d.expiresAt instanceof Timestamp) c.expiresAt = toCalendarDate(d.expiresAt);
  return c;
}

export function listenerFailure(err: FirestoreError): Snapshot<never> {
  return err.code === "permission-denied" ? { status: "denied" } : { status: "error", message: err.message };
}

/** includeMetadataChanges: a cache→server transition with identical data must still flip offline→ready. */
export const LISTEN = { includeMetadataChanges: true } as const;

export function watchRestaurants(hid: string, cb: (s: Snapshot<Restaurant[]>) => void): () => void {
  return onSnapshot(
    query(restaurantsCol(hid), orderBy("name")),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.docs.map(toRestaurant) }),
    (err) => cb(listenerFailure(err)),
  );
}

export function watchRestaurant(hid: string, rid: string, cb: (s: Snapshot<Restaurant>) => void): () => void {
  return onSnapshot(
    restaurantRef(hid, rid),
    LISTEN,
    (snap) => {
      if (!snap.exists()) {
        // A cached miss is not proof of deletion; only the server may say "gone".
        cb(snap.metadata.fromCache ? { status: "error", message: "You are offline and this restaurant has not been loaded on this device." } : { status: "gone" });
        return;
      }
      cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: toRestaurant(snap) });
    },
    (err) => cb(listenerFailure(err)),
  );
}

export function watchClaims(hid: string, rid: string, cb: (s: Snapshot<Claim[]>) => void): () => void {
  return onSnapshot(
    query(claimsCol(hid, rid)),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.docs.map(toClaim) }),
    (err) => cb(listenerFailure(err)),
  );
}

export function classify(err: unknown): WriteOutcome<never> {
  if (err instanceof ConflictError) return { kind: "conflict" };
  if (err instanceof NotFoundError) return { kind: "notFound" };
  const code = (err as { code?: string }).code;
  if (code === "permission-denied") return { kind: "permission" };
  if (code === "unavailable" || code === "deadline-exceeded") return { kind: "offline" };
  return { kind: "failed", message: err instanceof Error ? err.message : String(err) };
}

/** All writes go through here: offline pre-check, one transaction, typed outcome. Never throws. */
export async function write<T>(run: (tx: Transaction) => Promise<T>): Promise<WriteOutcome<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
  try {
    const value = await runTransaction(db, run);
    return { kind: "ok", value };
  } catch (err) {
    return classify(err);
  }
}

export function createRestaurant(hid: string, uid: string, input: RestaurantInput): Promise<WriteOutcome<string>> {
  return write(async (tx) => {
    const ref = doc(restaurantsCol(hid));
    const data: DocumentData = { name: input.name, address: input.address, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1, deleting: false };
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.website !== undefined) data.website = input.website;
    if (input.googlePlaceId !== undefined) data.googlePlaceId = input.googlePlaceId;
    tx.set(ref, data);
    return ref.id;
  });
}

/**
 * The version check runs inside the transaction, so it re-runs on every retry: a newer edit can
 * never be overwritten by a retried stale one (audit F2). Only the form's fields plus
 * version/updatedAt are written, so lat/lng/googlePlaceId are preserved.
 */
export function updateRestaurant(hid: string, rid: string, baseVersion: number, input: RestaurantInput): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (!snap.exists()) throw new NotFoundError();
    const current = toRestaurant(snap);
    if (current.deleting) throw new NotFoundError();
    if (current.version !== baseVersion) throw new ConflictError();
    const next = baseVersion + 1;
    tx.update(snap.ref, {
      name: input.name,
      address: input.address,
      phone: input.phone ?? deleteField(),
      website: input.website ?? deleteField(),
      updatedAt: serverTimestamp(),
      version: next,
    });
    return next;
  });
}

/** Deletion step 1. Idempotent: an already-marked restaurant is left alone (resume path). */
export function markDeleting(hid: string, rid: string, baseVersion: number): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (!snap.exists()) throw new NotFoundError();
    const current = toRestaurant(snap);
    if (current.deleting) return current.version;
    if (current.version !== baseVersion) throw new ConflictError();
    const next = baseVersion + 1;
    tx.update(snap.ref, { deleting: true, version: next, updatedAt: serverTimestamp() });
    return next;
  });
}

/**
 * Deletion steps 2–3 (spec §3.7): server-read pages; each page's documents are re-read inside one
 * transaction and only those still present are deleted, so two finishers and retries converge
 * instead of one of them failing on an already-deleted document.
 */
async function sweep(col: CollectionReference): Promise<WriteOutcome<number>> {
  let deleted = 0;
  for (;;) {
    let page;
    try {
      page = await getDocsFromServer(query(col, limit(SWEEP_PAGE)));
    } catch (err) {
      return classify(err);
    }
    if (page.empty) return { kind: "ok", value: deleted };
    const refs = page.docs.map((d) => d.ref);
    const outcome = await write(async (tx) => {
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      let removed = 0;
      for (const snap of snaps) {
        if (snap.exists()) {
          tx.delete(snap.ref);
          removed += 1;
        }
      }
      return removed;
    });
    if (outcome.kind !== "ok") return outcome;
    deleted += outcome.value;
  }
}

export function sweepClaims(hid: string, rid: string): Promise<WriteOutcome<number>> {
  return sweep(claimsCol(hid, rid));
}

export function sweepNotes(hid: string, rid: string): Promise<WriteOutcome<number>> {
  return sweep(notesCol(hid, rid));
}

/** Deletion step 4: the shortlist/visited document, if any. */
export function removeCollectionState(hid: string, rid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(collectionRef(hid, rid));
    if (snap.exists()) tx.delete(snap.ref);
  });
}

/** Deletion step 5, the completion gate. Already removed or already done counts as done. */
export function markCleanupDone(hid: string, rid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (!snap.exists()) return;
    const d = snap.data() as DocumentData;
    if (d.deleting !== true) throw new NotFoundError();
    if (d.cleanupDone === true) return;
    tx.update(snap.ref, { cleanupDone: true, version: Number(d.version) + 1, updatedAt: serverTimestamp() });
  });
}

/** Deletion step 6. The rules refuse this unless the gate is satisfied. Already removed counts as done. */
export function removeRestaurant(hid: string, rid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (snap.exists()) tx.delete(snap.ref);
  });
}

export async function finishDeleting(hid: string, rid: string, onProgress?: (step: DeleteStep) => void): Promise<WriteOutcome> {
  onProgress?.("sweeping");
  const claims = await sweepClaims(hid, rid);
  if (claims.kind !== "ok") return claims;
  onProgress?.("sweepingNotes");
  const notes = await sweepNotes(hid, rid);
  if (notes.kind !== "ok") return notes;
  onProgress?.("removing");
  const state = await removeCollectionState(hid, rid);
  if (state.kind !== "ok") return state;
  const done = await markCleanupDone(hid, rid);
  if (done.kind !== "ok") return done;
  return removeRestaurant(hid, rid);
}

/** The whole protocol (spec §3.5, extended by §3.7). Stops at the first non-ok step. */
export async function deleteRestaurant(hid: string, rid: string, baseVersion: number, onProgress?: (step: DeleteStep) => void): Promise<WriteOutcome> {
  onProgress?.("marking");
  const marked = await markDeleting(hid, rid, baseVersion);
  if (marked.kind !== "ok") return marked;
  return finishDeleting(hid, rid, onProgress);
}

export function addClaim(hid: string, rid: string, author: Author, input: ClaimInput): Promise<WriteOutcome<string>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true) throw new NotFoundError();
    const ref = doc(claimsCol(hid, rid));
    const source: DocumentData = { type: input.source.type, label: input.source.label };
    if (input.source.url !== undefined && input.source.url !== "") source.url = input.source.url;
    const data: DocumentData = {
      kind: input.kind,
      value: input.value,
      detail: input.detail,
      source,
      checkedAt: fromCalendarDate(input.checkedAt),
      authorUid: author.uid,
      authorName: author.displayName,
      createdAt: serverTimestamp(),
    };
    if (input.expiresAt !== undefined) data.expiresAt = fromCalendarDate(input.expiresAt);
    tx.set(ref, data);
    return ref.id;
  });
}

export function deleteClaim(hid: string, rid: string, cid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    tx.delete(doc(claimsCol(hid, rid), cid));
  });
}
