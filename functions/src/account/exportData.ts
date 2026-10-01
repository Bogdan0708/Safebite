import type { DocumentData, Firestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { MARKER_NAME } from "./marker";

/** Household export (spec §3.8). Names, never UIDs or emails; nothing from Google but googlePlaceId. */
export const EXPORT_MAX_BYTES = 8_000_000;

export interface ExportEvidence {
  kind: string; value: string; detail: string;
  source: { type: string; label: string; url?: string };
  checkedAt: string; expiresAt: string | null; authorName: string; createdAt: string;
}
export interface ExportNote { text: string; authorName: string; createdAt: string; updatedAt: string }
export interface ExportRestaurant {
  name: string; address: string; phone?: string; website?: string; googlePlaceId?: string;
  createdByName: string; createdAt: string; updatedAt: string;
  shortlisted: boolean; visited: boolean; visitedOn?: string; listUpdatedByName?: string; listUpdatedAt?: string;
  evidence: ExportEvidence[]; notes: ExportNote[];
}
export interface HouseholdExport {
  format: "safebite-export"; formatVersion: 1; exportedAt: string; exportedBy: string;
  household: { name: string };
  restaurants: ExportRestaurant[];
}

const notMember = () => new HttpsError("permission-denied", "This account is not a household member.");
const instant = (t: Timestamp) => t.toDate().toISOString();
const day = (t: Timestamp) => t.toDate().toISOString().slice(0, 10);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const optional = <K extends string>(key: K, v: unknown): Partial<Record<K, string>> =>
  (typeof v === "string" && v.length > 0 ? ({ [key]: v } as Record<K, string>) : {});
const byCreated = (a: DocumentData, b: DocumentData) => (a.createdAt as Timestamp).toMillis() - (b.createdAt as Timestamp).toMillis();

function evidence(c: DocumentData): ExportEvidence {
  const source = (c.source ?? {}) as DocumentData;
  return {
    kind: str(c.kind), value: str(c.value), detail: str(c.detail),
    source: { type: str(source.type), label: str(source.label), ...optional("url", source.url) },
    checkedAt: day(c.checkedAt as Timestamp),
    expiresAt: c.expiresAt ? day(c.expiresAt as Timestamp) : null,
    authorName: str(c.authorName), createdAt: instant(c.createdAt as Timestamp),
  };
}

/**
 * Everything is read in one read-only transaction, membership included, so the file is a
 * consistent snapshot of a household the caller belonged to at that instant.
 */
export async function readExport(db: Firestore, uid: string, now: Date, maxBytes = EXPORT_MAX_BYTES): Promise<HouseholdExport> {
  return db.runTransaction(async (tx) => {
    const user = await tx.get(db.doc(`users/${uid}`));
    const householdId: unknown = user.get("householdId");
    if (typeof householdId !== "string" || householdId.length === 0) throw notMember();
    const household = await tx.get(db.doc(`households/${householdId}`));
    const memberIds: unknown = household.get("memberIds");
    if (!household.exists || !Array.isArray(memberIds) || !memberIds.includes(uid)) throw notMember();

    const names = new Map<string, string>();
    for (const id of memberIds.filter((x): x is string => typeof x === "string")) {
      const name: unknown = (await tx.get(db.doc(`users/${id}`))).get("displayName");
      if (typeof name === "string" && name.length > 0) names.set(id, name);
    }
    const nameOf = (id: unknown) => (typeof id === "string" ? names.get(id) : undefined) ?? MARKER_NAME;

    const states = new Map<string, DocumentData>();
    for (const s of (await tx.get(db.collection(`households/${householdId}/collection`))).docs) states.set(s.id, s.data());

    const restaurants: ExportRestaurant[] = [];
    for (const r of (await tx.get(db.collection(`households/${householdId}/restaurants`))).docs) {
      const d = r.data();
      if (d.deleting === true) continue;
      const claims = (await tx.get(r.ref.collection("claims"))).docs.map((c) => c.data()).sort(byCreated);
      const notes = (await tx.get(r.ref.collection("notes"))).docs.map((n) => n.data()).sort(byCreated);
      const state = states.get(r.id);
      restaurants.push({
        name: str(d.name), address: str(d.address),
        ...optional("phone", d.phone), ...optional("website", d.website), ...optional("googlePlaceId", d.googlePlaceId),
        createdByName: nameOf(d.createdBy), createdAt: instant(d.createdAt as Timestamp), updatedAt: instant(d.updatedAt as Timestamp),
        shortlisted: state?.shortlisted === true, visited: state?.visited === true,
        ...(state?.visitedOn ? { visitedOn: day(state.visitedOn as Timestamp) } : {}),
        ...(state ? { listUpdatedByName: str(state.updatedByName), listUpdatedAt: instant(state.updatedAt as Timestamp) } : {}),
        evidence: claims.map(evidence),
        notes: notes.map((n) => ({ text: str(n.text), authorName: str(n.authorName), createdAt: instant(n.createdAt as Timestamp), updatedAt: instant(n.updatedAt as Timestamp) })),
      });
    }
    restaurants.sort((a, b) => a.name.localeCompare(b.name));

    const out: HouseholdExport = {
      format: "safebite-export", formatVersion: 1, exportedAt: now.toISOString(), exportedBy: nameOf(uid),
      household: { name: str(household.get("name")) },
      restaurants,
    };
    if (Buffer.byteLength(JSON.stringify(out), "utf8") > maxBytes) {
      throw new HttpsError("resource-exhausted", "The export is too large to download in one file.");
    }
    return out;
  }, { readOnly: true });
}
