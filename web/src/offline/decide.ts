import { pendingClear } from "../device/cleanup";
import { copyUsable } from "./eligibility";
import { isServingCopy } from "./session";
import { clearCopy, getOptIn, hasMalformedMeta, readMeta, recordMembershipCheck } from "./store";

/** Start-up decisions over the device copy (spec §3.9 membership table). Firebase-free. */
export type NoAnswerOutcome =
  | { kind: "open"; householdId: string; displayName: string; downloadedAt: number }
  | { kind: "expired" }
  | { kind: "none" };

/** The server could not answer: open the copy only if it is usable for this account. */
export async function decideNoAnswer(uid: string, now: number): Promise<NoAnswerOutcome> {
  const meta = await readMeta();
  if (!meta || meta.uid !== uid) return { kind: "none" };
  const verdict = copyUsable(meta, { uid, householdId: meta.householdId }, await getOptIn(uid), pendingClear(), now);
  if (verdict === true) return { kind: "open", householdId: meta.householdId, displayName: meta.displayName, downloadedAt: meta.downloadedAt };
  return verdict === "expired" ? { kind: "expired" } : { kind: "none" };
}

/**
 * Carries the household-move notice across this document's own reset (final review I1). A document
 * showing copy data resets itself when the copy is cleared (cross-tab invalidation reaches its own
 * channel too), so a reconnect from offlineMember would otherwise reload into a start-up that finds
 * no copy and never says the household changed. Per tab (sessionStorage), short-lived, read once.
 */
export const HOUSEHOLD_CHANGED_KEY = "safebite.offline.householdChanged";
const NOTICE_CARRY_MS = 60_000;

function carryNotice(uid: string, householdId: string, now: number): void {
  try {
    sessionStorage.setItem(HOUSEHOLD_CHANGED_KEY, JSON.stringify({ uid, householdId, at: now }));
  } catch {
    // Blocked: the member is still moved; only the notice after the reload is lost.
  }
}

function takeCarriedNotice(uid: string, householdId: string, now: number): boolean {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(HOUSEHOLD_CHANGED_KEY);
    if (raw !== null) sessionStorage.removeItem(HOUSEHOLD_CHANGED_KEY);
  } catch {
    return false;
  }
  if (raw === null) return false;
  try {
    const v = JSON.parse(raw) as { uid?: unknown; householdId?: unknown; at?: unknown } | null;
    return !!v && v.uid === uid && v.householdId === householdId && typeof v.at === "number" && Math.abs(now - v.at) <= NOTICE_CARRY_MS;
  } catch {
    return false;
  }
}

/**
 * The server confirmed membership of `householdId`. A copy tagged with another household or
 * account, or a meta record of the wrong shape, is cleared first (review P2-4, ruling 8); then a
 * matching copy's 30-day window is renewed (never creating meta). Never throws: a failed clear
 * must not block the member, and reads refuse a mismatched copy anyway. A household change found
 * while this document shows copy data is carried across the reset that the clear causes.
 */
export async function prepareMemberCopy(uid: string, householdId: string, now: number): Promise<{ householdChanged: boolean }> {
  const meta = await readMeta();
  let householdChanged = false;
  const mismatched = meta !== null && (meta.uid !== uid || meta.householdId !== householdId);
  if (mismatched || (meta === null && (await hasMalformedMeta()))) {
    householdChanged = mismatched && meta.uid === uid && (await getOptIn(uid));
    if (householdChanged && isServingCopy()) carryNotice(uid, householdId, now);
    try {
      await clearCopy();
    } catch {
      // The next start retries the clear.
    }
  } else {
    householdChanged = takeCarriedNotice(uid, householdId, now);
  }
  await recordMembershipCheck({ uid, householdId }, now);
  return { householdChanged };
}
