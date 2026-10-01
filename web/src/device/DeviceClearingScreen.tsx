import { useCallback, useEffect, useState } from "react";
import { clearDeviceData } from "./cleanup";

/** Shown at start-up while the pendingClear marker is set; renders nothing of the app. */
export function DeviceClearingScreen({ onCleared }: { onCleared: () => void }) {
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    setFailed(false);
    void clearDeviceData().then(({ failed: names }) => {
      if (names.length === 0) onCleared();
      else setFailed(true);
    });
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
