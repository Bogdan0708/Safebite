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
  try { sessionStorage.setItem(key, value); } catch { /* blocked: in-document recovery still works */ }
}
function remove(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* blocked */ }
}

export const readDeletionRequest = () => get(DELETION_REQUEST_KEY);
export const writeDeletionRequest = (requestId: string) => set(DELETION_REQUEST_KEY, requestId);
export const clearDeletionRequest = () => remove(DELETION_REQUEST_KEY);
export const writeDeletedNotice = (notice: DeletedNotice) => set(ACCOUNT_DELETED_KEY, notice);

export function takeDeletedNotice(): DeletedNotice | null {
  const value = get(ACCOUNT_DELETED_KEY);
  remove(ACCOUNT_DELETED_KEY);
  return value === "ok" || value === "clearFailed" ? value : null;
}
