import { CLOCK_TOLERANCE_MS, COPY_MAX_AGE_MS, STALE_BANNER_MS, type CopyIdentity, type CopyMeta } from "./types";

export type CopyIneligible = "none" | "otherCopy" | "optedOut" | "expired" | "pendingClear";

/**
 * A usable copy (spec §3.9 "Read source"): complete, tagged with this account and household,
 * opted in, no pending clear, and membership confirmed by the server within the last 30 days.
 * A check up to 5 minutes in the future (a small backward clock step) counts as age 0; further in the
 * future counts as outside the window, so setting the clock back cannot extend it. The tolerance
 * never extends the 30-day expiry.
 */
export function copyUsable(meta: CopyMeta | null, id: CopyIdentity, optedIn: boolean, pending: boolean, now: number): true | CopyIneligible {
  if (pending) return "pendingClear";
  if (!meta) return "none";
  if (meta.uid !== id.uid || meta.householdId !== id.householdId) return "otherCopy";
  if (!optedIn) return "optedOut";
  const age = now - meta.membershipCheckedAt;
  // Fails closed: a non-finite age (a NaN time or clock) is outside the window (final review M3).
  if (!(age >= -CLOCK_TOLERANCE_MS && age <= COPY_MAX_AGE_MS)) return "expired";
  return true;
}

/** The copy banner turns amber after 7 days. A download time in the future is not old. */
export function copyIsOld(meta: Pick<CopyMeta, "downloadedAt">, now: number): boolean {
  return now - meta.downloadedAt > STALE_BANNER_MS;
}
