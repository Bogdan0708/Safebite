import { callable } from "../api/callable";

export type ReceiptStatus = "none" | "started" | "dataDeleted" | "complete";

/** Longer than the function's 60 s timeout (spec §3.8). */
export const DELETE_TIMEOUT_MS = 70_000;

export const deleteAccountCall = callable<{ requestId: string }, { deleted: true; lastMember: boolean }>("deleteAccount", { timeout: DELETE_TIMEOUT_MS });
export const checkAccountDeletionCall = callable<{ requestId: string }, { status: ReceiptStatus }>("checkAccountDeletion", { timeout: 20_000 });

/** 32 random bytes as base64url without padding: 43 characters, the server's accepted format. */
export function newRequestId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
