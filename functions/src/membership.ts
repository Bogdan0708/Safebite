import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

export interface Member {
  uid: string;
  householdId: string;
  displayName: string;
}

/**
 * Resolve the caller to a household member or throw.
 * Identity comes only from request.auth — never from request.data.
 */
export async function requireMember(request: CallableRequest<unknown>): Promise<Member> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const householdId = userSnap.get("householdId");
  if (typeof householdId !== "string" || householdId.length === 0) {
    throw new HttpsError("permission-denied", "This account is not a household member.");
  }
  const householdSnap = await db.doc(`households/${householdId}`).get();
  const memberIds: unknown = householdSnap.get("memberIds");
  if (!Array.isArray(memberIds) || !memberIds.includes(uid)) {
    throw new HttpsError("permission-denied", "This account is not a household member.");
  }
  const displayName = userSnap.get("displayName");
  return {
    uid,
    householdId,
    displayName: typeof displayName === "string" ? displayName : "",
  };
}
