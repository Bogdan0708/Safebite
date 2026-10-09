import { reauthenticate, type ReauthResult } from "../auth/reauthenticate";
import { resetDocument } from "../auth/resetDocument";
import { clearDeviceData } from "../device/cleanup";
import { auth } from "../firebase";
import { deleteAccountCall, newRequestId } from "./api";
import { guardAuthSession, forgetAuthGuard } from "./authCleanupGuard";
import { recordDeletedUid } from "./deletedSessions";
import { removePersistedUserIfUid } from "./persistedSession";
import { classifyCallError } from "./recovery";
import { clearDeletionRequest, writeDeletedNotice, writeDeletionRequest } from "./storage";

export type DeleteOutcome =
  | { kind: "deleted" }
  | { kind: "cleanupPending" }
  | { kind: "reauth"; result: Exclude<ReauthResult, "ok"> }
  | { kind: "recentLogin" }
  | { kind: "permission" }
  | { kind: "failed" }
  | { kind: "accountChanged" }
  | { kind: "deletedOtherAccount" }
  | { kind: "lost"; requestId: string };

/**
 * Spec §3.8 sequence, bound to one account (implementation audit P1-1). The user object captured at
 * the start must still be auth.currentUser, with the expected uid, after reauthentication, after
 * the token refresh and right before the call: the callable sends whatever token is current then.
 * After the call is sent the token is never refreshed again.
 */
export async function deleteMyAccount(password: string, expectedUid: string): Promise<DeleteOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "reauth", result: "offline" };
  const user = auth.currentUser;
  if (!user || user.uid !== expectedUid) return { kind: "accountChanged" };
  const unchanged = () => auth.currentUser === user && user.uid === expectedUid;
  const reauth = await reauthenticate(password, user);
  if (reauth !== "ok") return { kind: "reauth", result: reauth };
  if (!unchanged()) return { kind: "accountChanged" };
  try {
    await user.getIdToken(true);
  } catch {
    return { kind: "failed" };
  }
  if (!unchanged()) return { kind: "accountChanged" };
  // A durable guard must precede the destructive request, including a lost response or tab close.
  // If shared storage refuses it, do not delete the server account.
  const requestId = newRequestId();
  if (!guardAuthSession(expectedUid, requestId)) return { kind: "failed" };
  writeDeletionRequest({ requestId, uid: expectedUid });
  try {
    await deleteAccountCall({ requestId, expectedUid });
  } catch (err) {
    const kind = classifyCallError(err);
    if (kind === "lost") return { kind: "lost", requestId };
    forgetAuthGuard(expectedUid, requestId);
    clearDeletionRequest();
    return { kind };
  }
  const result = await finishDeleted(expectedUid);
  return { kind: result === "finished" ? "deleted" : result === "cleanupPending" ? "cleanupPending" : "deletedOtherAccount" };
}

export type FinishResult = "finished" | "otherAccount" | "cleanupPending";

/**
 * The server confirmed deletion of requestUid's account. Completion acts only for that account
 * (auditor re-review, 2026-10-02): if a different account is current before or after the device
 * cleanup, no deleted notice is written. Completion never signs anyone out: it records requestUid
 * as a deleted session and resets the document; the auth listener keeps that session out of the
 * app. requestUid null (a request with no owner) acts only when nobody is signed in.
 */
export async function finishDeleted(requestUid: string | null): Promise<FinishResult> {
  const ours = () => {
    const current = auth.currentUser?.uid ?? null;
    return current === null || current === requestUid;
  };
  // Confirmation belongs to the deleted UID even if another account is now current. Keep
  // that fact in cleanup metadata so its old request guards can be retired on a safe startup.
  const guarded = requestUid === null || guardAuthSession(requestUid);
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  // Publish the confirmed UID BEFORE any await or navigation. Other tabs may reset as soon
  // as they observe it; their bootstrap must scrub this UID before starting persistent Auth.
  if (requestUid !== null) recordDeletedUid(requestUid);
  const { failed } = await clearDeviceData();
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  const removal = requestUid === null ? "notOurs" : await removePersistedUserIfUid(requestUid);
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  // A failed open is not successful cleanup. The durable tombstone survives this reset;
  // bootstrap retries the scrub, or selects memory-only Auth without reading the stale user.
  if (removal === "unavailable") {
    if (!guarded) return "cleanupPending"; // recovery from an older request with blocked storage
    failed.push("authSession");
  }
  writeDeletedNotice({ kind: failed.length === 0 ? "ok" : "clearFailed", uid: requestUid });
  clearDeletionRequest();
  // Never signOut here (final review P2): signOut queues a "no user" update that can remove another
  // account whose sign-in is already queued. The record keeps this deleted session out of the app.
  resetDocument();
  return "finished";
}
