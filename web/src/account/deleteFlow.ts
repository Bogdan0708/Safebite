import { signOut } from "firebase/auth";
import { reauthenticate, type ReauthResult } from "../auth/reauthenticate";
import { resetDocument } from "../auth/resetDocument";
import { clearDeviceData } from "../device/cleanup";
import { auth } from "../firebase";
import { deleteAccountCall, newRequestId } from "./api";
import { classifyCallError } from "./recovery";
import { clearDeletionRequest, writeDeletedNotice, writeDeletionRequest } from "./storage";

export type DeleteOutcome =
  | { kind: "deleted" }
  | { kind: "reauth"; result: Exclude<ReauthResult, "ok"> }
  | { kind: "recentLogin" }
  | { kind: "permission" }
  | { kind: "failed" }
  | { kind: "lost"; requestId: string };

/**
 * Spec §3.8 sequence: reauthenticate, refresh the token so the server sees the new auth_time,
 * store a fresh request id, call. After the call is sent the token is never refreshed again: for
 * a deleted account the SDK would report a revoked session and sign the tab out mid-recovery.
 */
export async function deleteMyAccount(password: string): Promise<DeleteOutcome> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "reauth", result: "offline" };
  const reauth = await reauthenticate(password);
  if (reauth !== "ok") return { kind: "reauth", result: reauth };
  const user = auth.currentUser;
  if (!user) return { kind: "failed" };
  try {
    await user.getIdToken(true);
  } catch {
    return { kind: "failed" };
  }
  const requestId = newRequestId();
  writeDeletionRequest(requestId);
  try {
    await deleteAccountCall({ requestId });
  } catch (err) {
    const kind = classifyCallError(err);
    if (kind === "lost") return { kind: "lost", requestId };
    clearDeletionRequest();
    return { kind };
  }
  await finishDeleted();
  return { kind: "deleted" };
}

/** The server confirmed deletion. Device data first; a clearing failure is reported separately. */
export async function finishDeleted(): Promise<void> {
  const { failed } = await clearDeviceData();
  writeDeletedNotice(failed.length === 0 ? "ok" : "clearFailed");
  clearDeletionRequest();
  try {
    await signOut(auth);
  } catch {
    // Already signed out (the SDK may have done it); the explicit reset below still runs.
  }
  resetDocument();
}
