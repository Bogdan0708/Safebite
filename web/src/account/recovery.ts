import { checkAccountDeletionCall, type ReceiptStatus } from "./api";

/**
 * Lost-response recovery (spec §3.8). Anything that does not prove the server refused is "lost",
 * resolved by the receipt. Auth error codes are never read: the SDK reports a deleted account and
 * a revoked session with the same code.
 */
export type CallErrorKind = "lost" | "recentLogin" | "permission" | "accountChanged" | "failed";

const REFUSALS = new Set(["invalid-argument", "unauthenticated", "not-found", "resource-exhausted", "already-exists", "out-of-range", "unimplemented"]);

export function classifyCallError(err: unknown): CallErrorKind {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !code.startsWith("functions/")) return "lost";
  const name = code.slice("functions/".length);
  if (name === "permission-denied") {
    const reason = ((err as { details?: { reason?: unknown } }).details ?? {}).reason;
    return reason === "accountChanged" ? "accountChanged" : "permission";
  }
  if (name === "failed-precondition") {
    const reason = ((err as { details?: { reason?: unknown } }).details ?? {}).reason;
    return reason === "recentLogin" ? "recentLogin" : "failed";
  }
  return REFUSALS.has(name) ? "failed" : "lost";
}

export type CheckResult = { ok: true; status: ReceiptStatus } | { ok: false };
export type RecoveryView = "success" | "otherAccount" | "confirmationUnavailable" | "unfinishedSignedIn" | "unfinishedSignedOut" | "uncertain";

/**
 * Spec §3.8 Recovery table (amended after the implementation audit P1-1, P2-3). Only the request's
 * own account can ever see a delete form; a missing receipt is never read as "unfinished".
 */
export function recoveryView(check: CheckResult, requestUid: string | null, currentUid: string | null): RecoveryView {
  if (!check.ok) return "uncertain";
  if (requestUid === null) return check.status === "complete" && currentUid === null ? "success" : "confirmationUnavailable";
  if (currentUid !== null && currentUid !== requestUid) return "otherAccount";
  if (check.status === "complete") return "success";
  if (check.status === "none") return "confirmationUnavailable";
  return currentUid === null ? "unfinishedSignedOut" : "unfinishedSignedIn";
}

const STATUSES: readonly ReceiptStatus[] = ["none", "started", "dataDeleted", "complete"];

export async function checkDeletion(requestId: string): Promise<CheckResult> {
  try {
    const { status } = await checkAccountDeletionCall({ requestId });
    return STATUSES.includes(status) ? { ok: true, status } : { ok: false };
  } catch {
    return { ok: false };
  }
}
