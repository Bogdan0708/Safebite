import { doc, onSnapshot, orderBy, query, serverTimestamp, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import { ConflictError, LISTEN, listenerFailure, notesCol, NotFoundError, restaurantRef, toDate, write, type Snapshot, type WriteOutcome } from "./repository";
import type { Author, Note } from "./types";

/**
 * Authored notes on a restaurant (spec §3.7). Only the author edits or deletes (rules-enforced);
 * edits and deletes carry the version the member saw, so a change from another device surfaces
 * as a conflict instead of being overwritten. Callers pass validated, trimmed text.
 */

export function toNote(snap: Pick<DocumentSnapshot, "id" | "data">): Note {
  const d = snap.data() as DocumentData;
  return {
    id: snap.id,
    text: String(d.text),
    authorUid: String(d.authorUid),
    authorName: String(d.authorName),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    version: Number(d.version),
  };
}

export function watchNotes(hid: string, rid: string, cb: (s: Snapshot<Note[]>) => void): () => void {
  return onSnapshot(
    query(notesCol(hid, rid), orderBy("createdAt", "desc")),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.docs.map(toNote) }),
    (err) => cb(listenerFailure(err)),
  );
}

export function addNote(hid: string, rid: string, author: Author, text: string): Promise<WriteOutcome<string>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true) throw new NotFoundError();
    const ref = doc(notesCol(hid, rid));
    tx.set(ref, { text, authorUid: author.uid, authorName: author.displayName, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1 });
    return ref.id;
  });
}

export function updateNote(hid: string, rid: string, nid: string, baseVersion: number, text: string): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    const snap = await tx.get(doc(notesCol(hid, rid), nid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true || !snap.exists()) throw new NotFoundError();
    const current = toNote(snap);
    if (current.version !== baseVersion) throw new ConflictError();
    const next = baseVersion + 1;
    tx.update(snap.ref, { text, updatedAt: serverTimestamp(), version: next });
    return next;
  });
}

export function deleteNote(hid: string, rid: string, nid: string, baseVersion: number): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(doc(notesCol(hid, rid), nid));
    if (!snap.exists()) throw new NotFoundError();
    if (toNote(snap).version !== baseVersion) throw new ConflictError();
    tx.delete(snap.ref);
  });
}
