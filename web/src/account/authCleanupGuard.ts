// One key per request avoids a cross-tab read/modify/write list. This is a local cleanup intent,
// NOT proof of server deletion; only a confirmed receipt may produce a deleted notice.
const PREFIX = "safebite.authCleanup.";

export function guardAuthSession(uid: string, requestId = "confirmed"): boolean {
  try {
    const key = PREFIX + encodeURIComponent(uid) + ":" + requestId;
    localStorage.setItem(key, "1");
    return localStorage.getItem(key) === "1";
  } catch { return false; }
}

export function forgetAuthGuard(uid: string, requestId?: string): void {
  try {
    const prefix = PREFIX + encodeURIComponent(uid) + ":";
    if (requestId !== undefined) localStorage.removeItem(prefix + requestId);
    else {
      // A successful explicit sign-in may forget all intents for this UID.
      const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
      for (const key of keys) localStorage.removeItem(key);
    }
  } catch { /* retain the safe guard */ }
}

export interface AuthGuard {
  key: string;
  uid: string;
  confirmed: boolean;
}

/** Throws if shared storage is unavailable: bootstrap must then select memory-only Auth. */
export function snapshotAuthGuards(): AuthGuard[] {
  const guards: AuthGuard[] = [];
  // Snapshot names once. Repeated key(i) calls can skip a surviving key when another tab
  // removes a preceding key between calls. Recheck each named value after the snapshot.
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX) && localStorage.getItem(key) === "1") {
      const [encodedUid, requestId] = key.slice(PREFIX.length).split(":");
      guards.push({ key, uid: decodeURIComponent(encodedUid!), confirmed: requestId === "confirmed" });
    }
  }
  return guards;
}

export function guardedAuthUids(): string[] {
  return snapshotAuthGuards().map(guard => guard.uid);
}

/** Only call after the database transaction committed or proved the session absent/not ours.
 * Retire just the captured confirmed UID's keys, preserving uncertain intents and new request
 * keys another tab wrote while cleanup awaited. Failed storage removal leaves a safe guard.
 */
export function retireConfirmedAuthGuards(guards: readonly AuthGuard[], confirmedUids: ReadonlySet<string>): void {
  for (const guard of guards) {
    if (!confirmedUids.has(guard.uid)) continue;
    try { localStorage.removeItem(guard.key); } catch { /* retry at a later startup */ }
  }
}
