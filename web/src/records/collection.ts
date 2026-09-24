import { collection, onSnapshot, serverTimestamp, Timestamp, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { fromCalendarDate, toCalendarDate } from "./dates";
import { collectionRef, ConflictError, LISTEN, listenerFailure, NotFoundError, restaurantRef, toDate, write, type Snapshot, type WriteOutcome } from "./repository";
import type { Author, CalendarDate, CollectionState } from "./types";

/**
 * Shortlist and visited state (spec §3.7). One document per restaurant, id = restaurant id,
 * written whole by every change so the stored shape always matches the rules. Online-only
 * transactions via the repository's write() (spec §3.5).
 */

export function toCollectionState(snap: Pick<DocumentSnapshot, "data">): CollectionState {
  const d = snap.data() as DocumentData;
  const s: CollectionState = {
    shortlisted: d.shortlisted === true,
    visited: d.visited === true,
    updatedBy: String(d.updatedBy),
    updatedByName: String(d.updatedByName),
    updatedAt: toDate(d.updatedAt),
    version: Number(d.version),
  };
  if (d.visitedOn instanceof Timestamp) s.visitedOn = toCalendarDate(d.visitedOn);
  return s;
}

export function watchCollection(hid: string, cb: (s: Snapshot<Record<string, CollectionState>>) => void): () => void {
  return onSnapshot(
    collection(db, "households", hid, "collection"),
    LISTEN,
    (snap) => {
      const value: Record<string, CollectionState> = {};
      for (const d of snap.docs) value[d.id] = toCollectionState(d);
      cb({ status: snap.metadata.fromCache ? "offline" : "ready", value });
    },
    (err) => cb(listenerFailure(err)),
  );
}

export function watchCollectionEntry(hid: string, rid: string, cb: (s: Snapshot<CollectionState | null>) => void): () => void {
  return onSnapshot(
    collectionRef(hid, rid),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.exists() ? toCollectionState(snap) : null }),
    (err) => cb(listenerFailure(err)),
  );
}

interface StatePatch {
  shortlisted?: boolean;
  visitedOn?: CalendarDate | null;
}

function writeState(hid: string, rid: string, author: Author, baseVersion: number, patch: StatePatch): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true) throw new NotFoundError();
    const ref = collectionRef(hid, rid);
    const snap = await tx.get(ref);
    const current = snap.exists() ? toCollectionState(snap) : null;
    const version = current?.version ?? 0;
    if (version !== baseVersion) throw new ConflictError();
    const shortlisted = patch.shortlisted ?? current?.shortlisted ?? false;
    const visitedOn = patch.visitedOn !== undefined ? patch.visitedOn : (current?.visitedOn ?? null);
    const data: DocumentData = {
      shortlisted,
      visited: visitedOn !== null,
      updatedBy: author.uid,
      updatedByName: author.displayName,
      updatedAt: serverTimestamp(),
      version: version + 1,
    };
    if (visitedOn !== null) data.visitedOn = fromCalendarDate(visitedOn);
    tx.set(ref, data);
    return version + 1;
  });
}

export function setShortlisted(hid: string, rid: string, author: Author, baseVersion: number, shortlisted: boolean): Promise<WriteOutcome<number>> {
  return writeState(hid, rid, author, baseVersion, { shortlisted });
}

/** `null` clears the visit. */
export function setVisited(hid: string, rid: string, author: Author, baseVersion: number, visitedOn: CalendarDate | null): Promise<WriteOutcome<number>> {
  return writeState(hid, rid, author, baseVersion, { visitedOn });
}
