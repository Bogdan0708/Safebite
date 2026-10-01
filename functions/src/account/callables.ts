import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { runDeletion } from "./deletion";
import { readExport, type HouseholdExport } from "./exportData";
import { MARKER_UID } from "./marker";
import { requireRecentAuth } from "./recentAuth";
import { checkReceipt, parseRequestId, receiptIdFor, startReceipt, type ReceiptStatus } from "./receipts";

// Set on each callable, not via setGlobalOptions: onCall snapshots options at definition (§3.6).
export const CALLABLE_OPTIONS = { region: "europe-west2", maxInstances: 2, timeoutSeconds: 60 } as const;

/** Logs never carry names, emails, request ids or receipt ids (spec §3.8). */
export const deleteAccount = onCall<unknown, Promise<{ deleted: true; lastMember: boolean }>>(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (uid === MARKER_UID) throw new HttpsError("permission-denied", "This account is not a household member.");
  requireRecentAuth(request.auth?.token.auth_time, Date.now());
  const receiptId = receiptIdFor(parseRequestId(request.data));
  const db = getFirestore();
  const started = Date.now();
  await startReceipt(db, receiptId, uid, started);
  const { lastMember } = await runDeletion(
    {
      db,
      auth: getAuth(),
      // Per-call writer: a backwards clock step poisons the shared default writer for the process lifetime.
      deleteTree: async (ref) => {
        const writer = db.bulkWriter();
        try {
          await db.recursiveDelete(ref, writer);
        } finally {
          await writer.close();
        }
      },
      now: () => Date.now(),
    },
    uid,
    receiptId,
  );
  logger.info("account.delete", { outcome: "ok", lastMember, durationMs: Date.now() - started });
  return { deleted: true, lastMember };
});

/** No sign-in: a deleted account has none. Reveals nothing without the 256-bit request id. */
export const checkAccountDeletion = onCall<unknown, Promise<{ status: ReceiptStatus }>>(CALLABLE_OPTIONS, async (request) => {
  const receiptId = receiptIdFor(parseRequestId(request.data));
  return { status: await checkReceipt(getFirestore(), getAuth(), receiptId, Date.now()) };
});

export const exportHousehold = onCall<unknown, Promise<HouseholdExport>>(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (uid === MARKER_UID) throw new HttpsError("permission-denied", "This account is not a household member.");
  const started = Date.now();
  const out = await readExport(getFirestore(), uid, new Date());
  logger.info("account.export", { outcome: "ok", restaurants: out.restaurants.length, durationMs: Date.now() - started });
  return out;
});
