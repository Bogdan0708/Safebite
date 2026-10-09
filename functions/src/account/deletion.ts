import type { Auth } from "firebase-admin/auth";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { MARKER_NAME, MARKER_UID } from "./marker";
import { markReceipt } from "./receipts";

/**
 * Account deletion (spec §3.8). Each call starts at the first step whose completion is not
 * recorded on accountDeletions/{uid} and repeats that step in full, so a crash at any point
 * converges on retry. Membership leaves first (rules then deny the departing member everything),
 * the Auth record goes last, and the receipt reaches "complete" only after it is gone.
 */
export type HookPoint = "step1" | "step2" | "step3" | "step3:restaurant" | "step4" | "step5" | "step6" | "step6:afterAuth";

export interface DeletionDeps {
  db: Firestore;
  auth: Pick<Auth, "deleteUser">;
  deleteTree: (ref: DocumentReference) => Promise<void>;
  now: () => number;
  /** Test-only: awaited before each step; may pause, or throw to simulate a crash. */
  hook?: (point: HookPoint) => Promise<void>;
  /** Claims and notes per anonymising transaction: 2 × chunk + 2 writes must stay under 500. */
  chunk?: number;
}

type Start = { kind: "record"; householdId: string } | { kind: "authOnly" };

/** The record is deleted only by step 5, so its absence means another call finished steps 1-5. */
class RecordGone extends Error {}

async function readRecord(ref: DocumentReference): Promise<Record<string, unknown>> {
  const snap = await ref.get();
  if (!snap.exists) throw new RecordGone();
  return snap.data() ?? {};
}

async function stamp(ref: DocumentReference, data: Record<string, unknown>): Promise<void> {
  try {
    await ref.update(data);
  } catch (err) {
    if ((err as { code?: number | string }).code === 5) throw new RecordGone();
    throw err;
  }
}

const notMember = () => new HttpsError("permission-denied", "This account is not a household member.");

export async function runDeletion(deps: DeletionDeps, uid: string, receiptId: string): Promise<{ lastMember: boolean }> {
  const { db } = deps;
  const hook = deps.hook ?? (async () => {});
  const recordRef = db.doc(`accountDeletions/${uid}`);
  const userRef = db.doc(`users/${uid}`);

  // Step 1: decide the starting point inside one transaction, never from earlier reads, so a
  // second call from the same uid cannot recreate a record another call already finished.
  await hook("step1");
  const start = await db.runTransaction<Start>(async (tx) => {
    const record = await tx.get(recordRef);
    const householdIdOnRecord: unknown = record.get("householdId");
    if (record.exists && typeof householdIdOnRecord === "string") return { kind: "record", householdId: householdIdOnRecord };
    const user = await tx.get(userRef);
    if (!user.exists) return { kind: "authOnly" };
    const householdId: unknown = user.get("householdId");
    if (typeof householdId !== "string" || householdId.length === 0) throw notMember();
    const household = await tx.get(db.doc(`households/${householdId}`));
    const memberIds: unknown = household.get("memberIds");
    if (!Array.isArray(memberIds) || !memberIds.includes(uid)) throw notMember();
    tx.create(recordRef, { householdId, startedAt: FieldValue.serverTimestamp() });
    return { kind: "record", householdId };
  });

  let lastMember = false;
  if (start.kind === "record") {
    const householdRef = db.doc(`households/${start.householdId}`);

    // Only step 5 deletes the record, and only after step4At is set, so a record missing after
    // step 1 proves steps 1-4 are done (another call from this uid finished). Steps 2-4 then
    // skip straight to step 5's receipt update; `update` is used so nothing recreates the record.
    try {
      // Step 2: leave the household; lastMember is decided once, in the same transaction.
      let record = await readRecord(recordRef);
      if (record.step2At === undefined) {
        await hook("step2");
        lastMember = await db.runTransaction(async (tx) => {
          const current = await tx.get(recordRef);
          if (!current.exists) throw new RecordGone();
          if (current.get("step2At") !== undefined) return current.get("lastMember") === true;
          const household = await tx.get(householdRef);
          const ids: unknown = household.get("memberIds");
          const memberIds = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
          const remaining = memberIds.filter((x) => x !== uid);
          if (household.exists && remaining.length !== memberIds.length) tx.update(householdRef, { memberIds: remaining });
          const last = remaining.length === 0;
          tx.update(recordRef, { lastMember: last, step2At: FieldValue.serverTimestamp() });
          return last;
        });
      } else {
        lastMember = record.lastMember === true;
      }

      // Step 3: anonymise (others remain) or delete the whole tree (last member). Completion is
      // recorded only after the whole step succeeded; a missing household document proves nothing.
      record = await readRecord(recordRef);
      if (record.step3At === undefined) {
        await hook("step3");
        if (lastMember) await deps.deleteTree(householdRef);
        else await anonymise(deps, hook, start.householdId, uid);
        await stamp(recordRef, { step3At: FieldValue.serverTimestamp() });
      }

      // Step 4: the users document.
      if (record.step4At === undefined) {
        await hook("step4");
        await userRef.delete();
        await stamp(recordRef, { step4At: FieldValue.serverTimestamp() });
      }
    } catch (err) {
      if (!(err instanceof RecordGone)) throw err;
    }

    // Step 5: the record, then the receipt says the data is gone.
    await hook("step5");
    await recordRef.delete();
    await markReceipt(db, receiptId, "dataDeleted", deps.now());
  }

  // Step 6: the Auth record last; only now is the receipt complete.
  // The Auth-only path proves steps 4 and 5 already ran (or the account was never provisioned):
  // record that before Auth deletion, as the record path does (implementation audit P2-2).
  if (start.kind === "authOnly") await markReceipt(db, receiptId, "dataDeleted", deps.now());
  await hook("step6");
  try {
    await deps.auth.deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
  await hook("step6:afterAuth");
  await markReceipt(db, receiptId, "complete", deps.now());
  return { lastMember };
}

/** Restaurants anonymised at once; each still awaits its own `step3:restaurant` hook first. */
const CONCURRENCY = 8;

/**
 * One transaction per chunk per restaurant re-reads every document it changes, so it writes the
 * marker only where the field still equals the departing uid at commit time: an edit by the
 * other member in between keeps their own attribution (review P2-4). Never bumps version or
 * updatedAt, so a departure raises no edit conflicts.
 *
 * A cheap read outside any transaction skips restaurants with nothing attributed to the uid, so a
 * retry does not pay four transactional reads per restaurant again (final review F1). Correctness
 * does not rest on it: membership left in step 2, so every write attributing to the uid committed
 * before this read and is visible to it. Then collection documents whose restaurant is gone.
 */
async function anonymise(deps: DeletionDeps, hook: (p: HookPoint) => Promise<void>, householdId: string, uid: string): Promise<void> {
  const { db } = deps;
  const chunk = deps.chunk ?? 200;
  const restaurants = await db.collection(`households/${householdId}/restaurants`).listDocuments();
  const collectionRef = db.collection(`households/${householdId}/collection`);

  // Bounded pool: workers take the next restaurant until the list is done or one has failed;
  // every worker settles before the error is rethrown, so nothing writes after this returns.
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < restaurants.length) {
      const restaurantRef = restaurants[next++];
      try {
        await hook("step3:restaurant");
        await anonymiseRestaurant(db, restaurantRef, collectionRef.doc(restaurantRef.id), uid, chunk);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, restaurants.length) }, worker));
  const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejected) throw rejected.reason;

  // Collection documents attributed to the uid whose restaurant no longer exists (final review F2).
  for (;;) {
    const page = await collectionRef.where("updatedBy", "==", uid).limit(chunk).select().get();
    if (page.empty) break;
    await db.runTransaction(async (tx) => {
      const states = await tx.getAll(...page.docs.map((d) => d.ref));
      for (const state of states) {
        if (state.exists && state.get("updatedBy") === uid) tx.update(state.ref, { updatedBy: MARKER_UID, updatedByName: MARKER_NAME });
      }
    });
    if (page.size < chunk) break;
  }
}

async function anonymiseRestaurant(db: Firestore, restaurantRef: DocumentReference, stateRef: DocumentReference, uid: string, chunk: number): Promise<void> {
  const [claimsProbe, notesProbe, [restaurantProbe, stateProbe]] = await Promise.all([
    restaurantRef.collection("claims").where("authorUid", "==", uid).limit(1).select().get(),
    restaurantRef.collection("notes").where("authorUid", "==", uid).limit(1).select().get(),
    db.getAll(restaurantRef, stateRef, { fieldMask: ["createdBy", "updatedBy"] }),
  ]);
  const attributed = !claimsProbe.empty || !notesProbe.empty || restaurantProbe.get("createdBy") === uid || stateProbe.get("updatedBy") === uid;
  if (!attributed) return;

  for (;;) {
    const more = await db.runTransaction(async (tx) => {
      const [claims, notes, restaurant, state] = await Promise.all([
        tx.get(restaurantRef.collection("claims").where("authorUid", "==", uid).limit(chunk)),
        tx.get(restaurantRef.collection("notes").where("authorUid", "==", uid).limit(chunk)),
        tx.get(restaurantRef),
        tx.get(stateRef),
      ]);
      for (const c of claims.docs) tx.update(c.ref, { authorUid: MARKER_UID, authorName: MARKER_NAME });
      for (const n of notes.docs) tx.delete(n.ref);
      if (restaurant.exists && restaurant.get("createdBy") === uid) tx.update(restaurantRef, { createdBy: MARKER_UID });
      if (state.exists && state.get("updatedBy") === uid) tx.update(stateRef, { updatedBy: MARKER_UID, updatedByName: MARKER_NAME });
      return claims.size === chunk || notes.size === chunk;
    });
    if (!more) break;
  }
}
