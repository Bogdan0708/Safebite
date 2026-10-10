import { useCallback, useEffect, useState } from "react";
import { CLEANER_TIMEOUT_MS, clearDeviceData, pendingClear, pendingClearKeys, retirePendingClearKeys } from "./cleanup";

/** Rounds before giving up when other tabs keep starting clears (each round re-captures). */
const MAX_ROUNDS = 3;
/** A live run finishes or times out within CLEANER_TIMEOUT_MS; a key still there after this is orphaned. */
const SETTLE_MS = CLEANER_TIMEOUT_MS + 1000;
const SETTLE_POLL_MS = 100;

/**
 * Shown at start-up while any pending-clear key is set; renders nothing of the app. Each round
 * captures the keys present before it runs and, on success, retires only those (spec §3.9,
 * review R2-3). A key written meanwhile by another tab's run survives and is covered by the next
 * round, so the gate is re-checked before the app opens.
 */
export function DeviceClearingScreen({ onCleared, settleMs = SETTLE_MS }: { onCleared: () => void; settleMs?: number }) {
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    setFailed(false);
    void (async () => {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const captured = pendingClearKeys();
        const { failed: names } = await clearDeviceData();
        if (names.length > 0) { setFailed(true); return; }
        retirePendingClearKeys(captured);
        // Keys left now were written during this round: usually another tab's run still in
        // progress, which retires its own key when done. Let it finish before clearing again, so
        // two tabs starting together do not chase each other's keys (Task 6 browser suite).
        const settleBy = Date.now() + settleMs;
        while (pendingClear() && Date.now() < settleBy) await new Promise((r) => setTimeout(r, SETTLE_POLL_MS));
        if (!pendingClear()) { onCleared(); return; }
      }
      setFailed(true);
    })();
  }, [onCleared, settleMs]);
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
