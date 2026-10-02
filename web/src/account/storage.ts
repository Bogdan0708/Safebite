/**
 * Per-tab session keys for account deletion (spec §3.8). Survive this tab's reset reload; never
 * shared across tabs; every access tolerates blocked storage.
 */
export const DELETION_REQUEST_KEY = "safebite.deletionRequest";
export const ACCOUNT_DELETED_KEY = "safebite.accountDeleted";
export type DeletedNotice = "ok" | "clearFailed";

function get(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function set(key: string, value: string): void {
  try { sessionStorage.setItem(key, value); } catch { /* blocked: callers read the key back and recover in the document instead of reloading */ }
}
function remove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* blocked */ }
}

/** A deletion request is bound to the account it was sent for (spec §3.8, implementation audit P1-1). */
export interface DeletionRequest { requestId: string; uid: string | null }

export function readDeletionRequest(): DeletionRequest | null {
  const raw = get(DELETION_REQUEST_KEY);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { requestId?: unknown; uid?: unknown };
    if (typeof value.requestId === "string" && typeof value.uid === "string" && value.uid.length > 0) {
      return { requestId: value.requestId, uid: value.uid };
    }
  } catch {
    // An older build saved the bare id.
  }
  return { requestId: raw, uid: null }; // no owner: recovery never offers a delete form
}
export const writeDeletionRequest = (request: { requestId: string; uid: string }) =>
  set(DELETION_REQUEST_KEY, JSON.stringify({ requestId: request.requestId, uid: request.uid }));
export const clearDeletionRequest = () => remove(DELETION_REQUEST_KEY);
export const writeDeletedNotice = (notice: DeletedNotice) => set(ACCOUNT_DELETED_KEY, notice);

export function takeDeletedNotice(): DeletedNotice | null {
  const value = get(ACCOUNT_DELETED_KEY);
  remove(ACCOUNT_DELETED_KEY);
  return value === "ok" || value === "clearFailed" ? value : null;
}
