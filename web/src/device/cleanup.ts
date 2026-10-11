/**
 * Device cleanup registry (spec §3.8). Every store that keeps household data on the device
 * registers a cleaner (5b adds the IndexedDB copy). clearDeviceData runs on every account change
 * and after account deletion. The pending-clear keys (one per run) are set before the cleaners run and
 * removed only when all succeeded; start-up refuses to render anything while it is set, so a failed or
 * interrupted clear can never expose a previous account's data.
 */
export interface DeviceCleaner {
  name: string;
  clear(): Promise<void>;
}

/** Legacy single marker from 5a builds; still honoured and retired. */
export const PENDING_CLEAR_KEY = "safebite.pendingClear";
/** One key per clearing run (spec §3.9, review P3-8): one run's success can never hide another's failure. */
export const PENDING_CLEAR_PREFIX = "safebite.pendingClear.";
export const CLEANER_TIMEOUT_MS = 5_000;

function newRunKey(): string {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return PENDING_CLEAR_PREFIX + token;
}

function writeKey(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Storage blocked (private mode): nothing can persist there either, so there is nothing to guard.
  }
}

/** Every pending key present now: the legacy marker and every run's own key. */
export function pendingClearKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k === PENDING_CLEAR_KEY || k.startsWith(PENDING_CLEAR_PREFIX));
  } catch {
    return [];
  }
}

export function pendingClear(): boolean {
  return pendingClearKeys().length > 0;
}

/** Removes exactly the given keys; keys written later by another run are left for that run. */
export function retirePendingClearKeys(keys: readonly string[]): void {
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // blocked: the key stays and start-up clears again
    }
  }
}

const cleaners: DeviceCleaner[] = [];

export function registerDeviceCleaner(cleaner: DeviceCleaner): void {
  if (!cleaners.some((c) => c.name === cleaner.name)) cleaners.push(cleaner);
}

export function _resetDeviceCleanersForTests(): void {
  cleaners.length = 0;
}

function withTimeout(run: () => Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve()
      .then(run)
      .then(
        () => { clearTimeout(timer); resolve(); },
        (err: unknown) => { clearTimeout(timer); reject(err); },
      );
  });
}

export async function clearDeviceData(): Promise<{ failed: string[] }> {
  const key = newRunKey();
  writeKey(key);
  const outcomes = await Promise.all(
    cleaners.map(async (c) => {
      try {
        await withTimeout(() => c.clear(), CLEANER_TIMEOUT_MS);
        return null;
      } catch {
        return c.name;
      }
    }),
  );
  const failed = outcomes.filter((n): n is string => n !== null);
  if (failed.length === 0) retirePendingClearKeys([key]);
  return { failed };
}
