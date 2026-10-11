import type { Claim, CollectionState, Note, Restaurant } from "../records/types";

/**
 * Offline copy (spec §3.9). Firebase-free: this module, store.ts, signals.ts, eligibility.ts,
 * session.ts, withCopy.ts and writeAccess.ts must never import firebase/* or ../firebase, so the
 * cleaner can be registered before §3.8's Auth persistence gate runs (review P2-5).
 */
export const COPY_DB_NAME = "safebite-offline";
export const COPY_DB_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
export const COPY_MAX_AGE_MS = 30 * DAY_MS;
export const STALE_BANNER_MS = 7 * DAY_MS;
/** Full copy refresh while visible, and the resume-staleness threshold (owner follow-up 2026-10-11; was 15 min). */
export const COPY_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
/** Quiet server membership read while visible: every `member`, and the `offlineMember` retry. */
export const MEMBERSHIP_CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** A `membershipCheckedAt` up to this far in the future counts as age 0 (a small backward clock step). */
export const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
export const ELIGIBILITY_CHECK_MS = 60 * 1000;
export const EARLY_OPEN_MS = 3000;

export interface CopyIdentity { uid: string; householdId: string }

export interface CopyMeta {
  uid: string;
  householdId: string;
  displayName: string;
  /** Counts replacements; every full or partial replacement checks and increments it (review R2-2). */
  revision: number;
  /** Last complete download (ms). A partial refresh never changes it. */
  downloadedAt: number;
  /** Last server-confirmed membership (ms). Renews the 30-day window. */
  membershipCheckedAt: number;
  complete: true;
}

export interface CopyData {
  /** Ordered by name, as the live `orderBy("name")` query. */
  restaurants: Restaurant[];
  claims: Record<string, Claim[]>;
  collection: Record<string, CollectionState>;
  /** Newest first per restaurant, as the live `orderBy("createdAt", "desc")` query. */
  notes: Record<string, Note[]>;
}

export interface RestaurantData {
  restaurant: Restaurant;
  claims: Claim[];
  notes: Note[];
  state: CollectionState | null;
}

/** Captured before a refresh's server reads; enforced inside the replacing transaction. */
export interface CopyToken { epoch: number; revision: number }

export type ReplaceResult =
  | "written"
  | "stale" // another tab replaced the copy since this token was read
  | "cleared" // the copy was cleared since this token was read (epoch changed, or the database was evicted)
  | "optedOut"
  | "otherCopy" // meta names another account or household
  | "noCopy" // a partial replacement needs an existing complete copy
  | "storageFull"
  | "unavailable";

export type ReadCopyResult =
  | { kind: "copy"; meta: CopyMeta; data: CopyData }
  | { kind: "none" }
  | { kind: "malformed" };
