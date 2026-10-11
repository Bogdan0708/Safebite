import { collection, doc, getDocFromServer, getDocsFromServer, orderBy, query, type DocumentSnapshot, type Query, type QuerySnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { toCollectionState } from "../records/collection";
import { toNote } from "../records/notes";
import { toClaim, toRestaurant } from "../records/repository";
import type { CollectionState } from "../records/types";
import type { CopyData, RestaurantData } from "./types";

/**
 * Refresh reads (spec §3.9 "Server reads"): server-pinned, and a cache-served snapshot is refused.
 * No collection-group rule exists or is added, so claims and notes are one query per restaurant.
 */
export class RefreshOffline extends Error {}
export class RefreshDenied extends Error {}

export interface ReadStats { queries: number; documents: number; emptyQueries: number }

function mapError(err: unknown): never {
  if (err instanceof RefreshOffline || err instanceof RefreshDenied) throw err;
  const code = (err as { code?: unknown }).code;
  if (code === "permission-denied") throw new RefreshDenied();
  if (code === "unavailable" || code === "deadline-exceeded") throw new RefreshOffline();
  throw err;
}

async function serverQuery(source: Query, stats: ReadStats): Promise<QuerySnapshot> {
  try {
    const snap = await getDocsFromServer(source);
    if (snap.metadata.fromCache) throw new RefreshOffline();
    stats.queries += 1;
    stats.documents += snap.docs.length;
    if (snap.docs.length === 0) stats.emptyQueries += 1;
    return snap;
  } catch (err) {
    return mapError(err);
  }
}

async function serverDoc(path: string[], stats: ReadStats): Promise<DocumentSnapshot> {
  try {
    const [first, ...rest] = path;
    const snap = await getDocFromServer(doc(db, first!, ...rest));
    if (snap.metadata.fromCache) throw new RefreshOffline();
    stats.queries += 1;
    stats.documents += snap.exists() ? 1 : 0;
    return snap;
  } catch (err) {
    return mapError(err);
  }
}

const restaurantsQuery = (hid: string) => query(collection(db, "households", hid, "restaurants"), orderBy("name"));
const claimsQuery = (hid: string, rid: string) => query(collection(db, "households", hid, "restaurants", rid, "claims"));
const notesQuery = (hid: string, rid: string) => query(collection(db, "households", hid, "restaurants", rid, "notes"), orderBy("createdAt", "desc"));

export async function readHouseholdFromServer(hid: string): Promise<{ data: CopyData; stats: ReadStats }> {
  const stats: ReadStats = { queries: 0, documents: 0, emptyQueries: 0 };
  const restaurants = (await serverQuery(restaurantsQuery(hid), stats)).docs.map(toRestaurant);
  const data: CopyData = { restaurants, claims: {}, collection: {}, notes: {} };
  await Promise.all(restaurants.map(async (r) => {
    const [claims, notes] = await Promise.all([serverQuery(claimsQuery(hid, r.id), stats), serverQuery(notesQuery(hid, r.id), stats)]);
    data.claims[r.id] = claims.docs.map(toClaim);
    data.notes[r.id] = notes.docs.map(toNote);
  }));
  const states = await serverQuery(collection(db, "households", hid, "collection"), stats);
  for (const d of states.docs) data.collection[d.id] = toCollectionState(d);
  return { data, stats };
}

export async function readRestaurantFromServer(hid: string, rid: string): Promise<{ data: RestaurantData | null; stats: ReadStats }> {
  const stats: ReadStats = { queries: 0, documents: 0, emptyQueries: 0 };
  const snap = await serverDoc(["households", hid, "restaurants", rid], stats);
  if (!snap.exists()) return { data: null, stats };
  const [claims, notes, state] = await Promise.all([
    serverQuery(claimsQuery(hid, rid), stats),
    serverQuery(notesQuery(hid, rid), stats),
    serverDoc(["households", hid, "collection", rid], stats),
  ]);
  const collectionState: CollectionState | null = state.exists() ? toCollectionState(state) : null;
  return { data: { restaurant: toRestaurant(snap), claims: claims.docs.map(toClaim), notes: notes.docs.map(toNote), state: collectionState }, stats };
}
