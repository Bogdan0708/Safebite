import { createHash } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Completion receipts (spec §3.8). The client sends a fresh 256-bit requestId with each
 * deleteAccount call; the receipt lives under its SHA-256, so only the holder can look it up,
 * and it outlives the Auth record so a lost response can be resolved without guessing. The uid
 * is kept only until the receipt is complete, so checkReceipt can test whether the Auth record
 * still exists. A Firestore TTL policy on expireAt deletes receipts after 7 days.
 */
export type ReceiptStatus = "none" | "started" | "dataDeleted" | "complete";
export const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const REQUEST_ID = /^[A-Za-z0-9_-]{43}$/;
const ORDER: Record<Exclude<ReceiptStatus, "none">, number> = { started: 1, dataDeleted: 2, complete: 3 };

export function parseRequestId(data: unknown): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Expected an object.");
  }
  const requestId = (data as Record<string, unknown>).requestId;
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    throw new HttpsError("invalid-argument", "requestId is malformed.");
  }
  return requestId;
}

export function receiptIdFor(requestId: string): string {
  return createHash("sha256").update(requestId).digest("hex");
}

function receiptRef(db: Firestore, receiptId: string): DocumentReference {
  return db.doc(`accountDeletionReceipts/${receiptId}`);
}

function stamps(nowMs: number) {
  return { updatedAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(nowMs + RECEIPT_TTL_MS) };
}

const isStatus = (v: unknown): v is Exclude<ReceiptStatus, "none"> => v === "started" || v === "dataDeleted" || v === "complete";

/**
 * Creates a `started` receipt. A retry with the same id by the same uid changes nothing; an id
 * held by another uid, or already complete, is refused, so a replayed id can never attach a
 * finished receipt to a different deletion.
 */
export async function startReceipt(db: Firestore, receiptId: string, uid: string, nowMs: number): Promise<void> {
  const ref = receiptRef(db, receiptId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.create(ref, { status: "started", uid, ...stamps(nowMs) });
      return;
    }
    if (snap.get("status") === "complete" || snap.get("uid") !== uid) {
      throw new HttpsError("invalid-argument", "requestId is malformed.");
    }
  });
}

/** Advances a receipt; never moves it backwards and never creates one. */
export async function markReceipt(db: Firestore, receiptId: string, next: "dataDeleted" | "complete", nowMs: number): Promise<void> {
  const ref = receiptRef(db, receiptId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current: unknown = snap.get("status");
    if (!snap.exists || !isStatus(current) || ORDER[current] >= ORDER[next]) return;
    tx.update(ref, { status: next, ...stamps(nowMs), ...(next === "complete" ? { uid: FieldValue.delete() } : {}) });
  });
}

/**
 * The only way a client learns a receipt's state. For dataDeleted it checks the Auth record
 * itself: the browser SDK cannot tell a deleted account from a revoked session (spec §3.8).
 */
export async function checkReceipt(db: Firestore, auth: Pick<Auth, "getUser">, receiptId: string, nowMs: number): Promise<ReceiptStatus> {
  const snap = await receiptRef(db, receiptId).get();
  const status: unknown = snap.get("status");
  if (!snap.exists || !isStatus(status)) return "none";
  if (status !== "dataDeleted") return status;
  const uid: unknown = snap.get("uid");
  if (typeof uid !== "string") return status;
  try {
    await auth.getUser(uid);
    return "dataDeleted";
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    await markReceipt(db, receiptId, "complete", nowMs);
    return "complete";
  }
}
