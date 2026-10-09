/**
 * Device cleanup registry (spec §3.8). Every store that keeps household data on the device
 * registers a cleaner (5b adds the IndexedDB copy). clearDeviceData runs on every account change
 * and after account deletion. The pendingClear marker is set before the cleaners run and removed
 * only when all succeeded; start-up refuses to render anything while it is set, so a failed or
 * interrupted clear can never expose a previous account's data.
 */
export interface DeviceCleaner {
  name: string;
  clear(): Promise<void>;
}

export const PENDING_CLEAR_KEY = "safebite.pendingClear";
export const CLEANER_TIMEOUT_MS = 5_000;

const cleaners: DeviceCleaner[] = [];

export function registerDeviceCleaner(cleaner: DeviceCleaner): void {
  if (!cleaners.some((c) => c.name === cleaner.name)) cleaners.push(cleaner);
}

export function _resetDeviceCleanersForTests(): void {
  cleaners.length = 0;
}

function setMarker(on: boolean): void {
  try {
    if (on) localStorage.setItem(PENDING_CLEAR_KEY, "1");
    else localStorage.removeItem(PENDING_CLEAR_KEY);
  } catch {
    // Storage blocked (private mode): nothing can persist there either, so there is nothing to guard.
  }
}

export function pendingClear(): boolean {
  try {
    return localStorage.getItem(PENDING_CLEAR_KEY) === "1";
  } catch {
    return false;
  }
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
  setMarker(true);
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
  if (failed.length === 0) setMarker(false);
  return { failed };
}
