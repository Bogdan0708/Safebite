import { reauthenticate, type ReauthResult } from "../auth/reauthenticate";
import { resetDocument } from "../auth/resetDocument";
import { clearDeviceData } from "../device/cleanup";
import { auth } from "../firebase";
import { deleteAccountCall, newRequestId } from "./api";
import { recordDeletedUid } from "./deletedSessions";
import { classifyCallError } from "./recovery";
import { clearDeletionRequest, writeDeletedNotice, writeDeletionRequest } from "./storage";

export type DeleteOutcome =
  | { kind: "deleted" }
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
  const requestId = newRequestId();
  writeDeletionRequest({ requestId, uid: expectedUid });
  try {
    await deleteAccountCall({ requestId, expectedUid });
  } catch (err) {
    const kind = classifyCallError(err);
    if (kind === "lost") return { kind: "lost", requestId };
    clearDeletionRequest();
    return { kind };
  }
  return (await finishDeleted(expectedUid)) === "finished" ? { kind: "deleted" } : { kind: "deletedOtherAccount" };
}

export type FinishResult = "finished" | "otherAccount";

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
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  const { failed } = await clearDeviceData(); // device data goes either way
  if (!ours()) { clearDeletionRequest(); return "otherAccount"; }
  if (requestUid !== null) recordDeletedUid(requestUid);
  writeDeletedNotice({ kind: failed.length === 0 ? "ok" : "clearFailed", uid: requestUid });
  clearDeletionRequest();
  // Never signOut here (final review P2): signOut queues a "no user" update that can remove another
  // account whose sign-in is already queued. The record keeps this deleted session out of the app.
  resetDocument();
  return "finished";
}
