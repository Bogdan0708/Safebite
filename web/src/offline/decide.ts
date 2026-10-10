import { pendingClear } from "../device/cleanup";
import { copyUsable } from "./eligibility";
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
 * The server confirmed membership of `householdId`. A copy tagged with another household or
 * account, or a meta record of the wrong shape, is cleared first (review P2-4, ruling 8); then a
 * matching copy's 30-day window is renewed (never creating meta). Never throws: a failed clear
 * must not block the member, and reads refuse a mismatched copy anyway.
 */
export async function prepareMemberCopy(uid: string, householdId: string, now: number): Promise<{ householdChanged: boolean }> {
  const meta = await readMeta();
  let householdChanged = false;
  const mismatched = meta !== null && (meta.uid !== uid || meta.householdId !== householdId);
  if (mismatched || (meta === null && (await hasMalformedMeta()))) {
    householdChanged = mismatched && meta.uid === uid && (await getOptIn(uid));
    try {
      await clearCopy();
    } catch {
      // The next start retries the clear.
    }
  }
  await recordMembershipCheck({ uid, householdId }, now);
  return { householdChanged };
}
