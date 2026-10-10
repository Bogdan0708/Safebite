import { persistentAuthAllowed } from "../account/authPersistence";
import { isDeletedUid } from "../account/deletedSessions";
import { readPersistedUid } from "../account/persistedSession";
import { decideNoAnswer } from "./decide";

/** Early opening (spec §3.9 ruling 7): every condition must hold, or nothing opens. Firebase-free. */
export interface EarlyCandidate { uid: string; householdId: string; displayName: string; downloadedAt: number }

export interface EarlyDeps {
  persistentAuthAllowed(): boolean;
  readPersistedUid(): Promise<string | null | "unavailable">;
  isDeletedUid(uid: string): boolean;
}

const realDeps: EarlyDeps = { persistentAuthAllowed, readPersistedUid, isDeletedUid };

export async function earlyCopyCandidate(now: number, deps: EarlyDeps = realDeps): Promise<EarlyCandidate | null> {
  if (!deps.persistentAuthAllowed()) return null;
  const uid = await deps.readPersistedUid();
  if (uid === null || uid === "unavailable" || deps.isDeletedUid(uid)) return null;
  const outcome = await decideNoAnswer(uid, now);
  if (outcome.kind !== "open") return null;
  return { uid, householdId: outcome.householdId, displayName: outcome.displayName, downloadedAt: outcome.downloadedAt };
}
