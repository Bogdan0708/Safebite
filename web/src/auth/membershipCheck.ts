import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "../firebase";
import { resolveMembership } from "./membership";

/**
 * The membership read (spec §3.9 "Server reads", review P1-1). Pinned to the server: the memory
 * cache can answer a default-source read for any document a live listener holds, so persistence
 * being off is not enough. permission-denied is a server answer (not a member); unavailable,
 * deadline-exceeded and cache-served snapshots are "no answer"; anything else rejects.
 */
export const MEMBERSHIP_TIMEOUT_MS = 6000;

export type MembershipAnswer =
  | { kind: "member"; householdId: string; displayName: string }
  | { kind: "notMember"; canDeleteSignIn: boolean }
  | { kind: "deletionPending" }
  | { kind: "noAnswer" };

class NoAnswer extends Error {}
const NO_ANSWER = new Set(["unavailable", "deadline-exceeded"]);

async function readServerDoc(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const snapshot = await getDocFromServer(doc(db, path));
    if (snapshot.metadata.fromCache) throw new NoAnswer();
    return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined;
  } catch (err) {
    if (err instanceof NoAnswer) throw err;
    const code = (err as { code?: unknown }).code;
    if (code === "permission-denied") return undefined; // the rules deny exactly when not a member
    if (typeof code === "string" && NO_ANSWER.has(code)) throw new NoAnswer();
    throw err;
  }
}

export async function readMembershipFromServer(uid: string): Promise<MembershipAnswer> {
  try {
    const userDoc = await readServerDoc(`users/${uid}`);
    const householdId = userDoc?.householdId;
    const householdDoc = typeof householdId === "string" ? await readServerDoc(`households/${householdId}`) : undefined;
    const membership = resolveMembership(uid, userDoc, householdDoc);
    if (membership.kind === "member") return { kind: "member", householdId: membership.householdId, displayName: membership.displayName };
    // An interrupted account deletion (spec §3.8): the owner may read their own record.
    if ((await readServerDoc(`accountDeletions/${uid}`)) !== undefined) return { kind: "deletionPending" };
    return { kind: "notMember", canDeleteSignIn: userDoc === undefined };
  } catch (err) {
    if (err instanceof NoAnswer) return { kind: "noAnswer" };
    throw err;
  }
}

/**
 * `first` settles with the read or with "no answer" at the timeout (at once when the browser
 * reports offline); `late` is the read itself, never cancelled, so a later answer can still be
 * applied (review P3-7). Callers must handle `late`'s rejection.
 */
export function membershipWithTimeout(uid: string, timeoutMs: number = MEMBERSHIP_TIMEOUT_MS): { first: Promise<MembershipAnswer>; late: Promise<MembershipAnswer> } {
  const late = readMembershipFromServer(uid);
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const timeout = new Promise<MembershipAnswer>((resolve) => {
    setTimeout(() => resolve({ kind: "noAnswer" }), offline ? 0 : timeoutMs);
  });
  return { first: Promise.race([late, timeout]), late };
}
