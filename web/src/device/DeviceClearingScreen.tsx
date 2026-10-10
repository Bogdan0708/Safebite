import { useCallback, useEffect, useState } from "react";
import { clearDeviceData, pendingClear, pendingClearKeys, retirePendingClearKeys } from "./cleanup";

/** Rounds before giving up when other tabs keep starting clears (each round re-captures). */
const MAX_ROUNDS = 3;

/**
 * Shown at start-up while any pending-clear key is set; renders nothing of the app. Each round
 * captures the keys present before it runs and, on success, retires only those (spec §3.9,
 * review R2-3). A key written meanwhile by another tab's run survives and is covered by the next
 * round, so the gate is re-checked before the app opens.
 */
export function DeviceClearingScreen({ onCleared }: { onCleared: () => void }) {
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    setFailed(false);
    void (async () => {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const captured = pendingClearKeys();
        const { failed: names } = await clearDeviceData();
        if (names.length > 0) { setFailed(true); return; }
        retirePendingClearKeys(captured);
        if (!pendingClear()) { onCleared(); return; }
      }
      setFailed(true);
    })();
  }, [onCleared]);
  useEffect(run, [run]);
  return (
    <main className="screen" data-testid="device-clearing">
      {failed ? (
        <>
          <p role="alert" data-testid="device-clear-failed">Some data on this device couldn't be cleared.</p>
          <button type="button" data-testid="device-clear-retry" onClick={run}>Try again</button>
        </>
      ) : (
        <p>Clearing data from this device…</p>
      )}
    </main>
  );
}
