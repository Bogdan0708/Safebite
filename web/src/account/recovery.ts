import { checkAccountDeletionCall, type ReceiptStatus } from "./api";

/**
 * Lost-response recovery (spec §3.8). Anything that does not prove the server refused is "lost",
 * resolved by the receipt. Auth error codes are never read: the SDK reports a deleted account and
 * a revoked session with the same code.
 */
export type CallErrorKind = "lost" | "recentLogin" | "permission" | "failed";

const REFUSALS = new Set(["invalid-argument", "unauthenticated", "not-found", "resource-exhausted", "already-exists", "out-of-range", "unimplemented"]);

export function classifyCallError(err: unknown): CallErrorKind {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string" || !code.startsWith("functions/")) return "lost";
  const name = code.slice("functions/".length);
  if (name === "permission-denied") return "permission";
  if (name === "failed-precondition") {
    const reason = ((err as { details?: { reason?: unknown } }).details ?? {}).reason;
    return reason === "recentLogin" ? "recentLogin" : "failed";
  }
  return REFUSALS.has(name) ? "failed" : "lost";
}

export type CheckResult = { ok: true; status: ReceiptStatus } | { ok: false };
export type RecoveryView = "success" | "unfinishedSignedIn" | "unfinishedSignedOut" | "uncertain";

export function recoveryView(check: CheckResult, signedIn: boolean): RecoveryView {
  if (!check.ok) return "uncertain";
  if (check.status === "complete") return "success";
  return signedIn ? "unfinishedSignedIn" : "unfinishedSignedOut";
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
