import { useEffect, useRef, useState } from "react";
import { persistentAuthAllowed } from "../account/authPersistence";
import { useAuth } from "../auth/AuthProvider";
import { clearDeviceData } from "../device/cleanup";
import { formatCopyTime } from "./format";
import { notifyOptInChanged, refresher, useRefreshStatus, type RefreshFailure, type RefreshStatus } from "./refresher";
import { clearCopy, getOptIn, readMeta, setOptIn } from "./store";
import type { CopyMeta } from "./types";
import { useConnectivity } from "./writeAccess";

const REASON: Record<RefreshFailure, string> = {
  offline: "You're offline.",
  storage: "Storage is full or unavailable on this device.",
  server: "Couldn't reach SafeBite.",
  denied: "Couldn't reach SafeBite.",
};

/** Settings → Offline copy (spec §3.9 "Screens and wording"): this device, this sign-in. */
export function OfflineSection() {
  const { state } = useAuth();
  const session = state.status === "member" || state.status === "offlineMember" ? state : null;
  const uid = session?.uid ?? null;
  const status = useRefreshStatus();
  const connected = useConnectivity();
  const [optedIn, setOptedIn] = useState(false);
  const [meta, setMeta] = useState<CopyMeta | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [persistWarning, setPersistWarning] = useState(false);
  const [cantStore, setCantStore] = useState(false);
  const [clearResult, setClearResult] = useState<"ok" | "failed" | null>(null);
  // The refresher status seen when the switch was turned on here: a "can't store" already in it
  // belongs to an earlier attempt and must not turn the new one off.
  const statusAtTurnOn = useRef<RefreshStatus | null>(null);

  useEffect(() => {
    if (uid === null) return;
    let live = true;
    void getOptIn(uid).then((on) => { if (live) setOptedIn(on); }, () => {});
    return () => { live = false; };
  }, [uid]);

  useEffect(() => {
    let live = true;
    void readMeta().then((m) => { if (live) setMeta(m && m.uid === uid ? m : null); }, () => {});
    return () => { live = false; };
  }, [uid, optedIn, status.running, status.lastWrittenAt]);

  // Quota refused or IndexedDB missing on the first write: the switch stays off (spec §3.9).
  // The refresher sets `cantStore` only when no copy exists after the refused write.
  useEffect(() => {
    if (uid === null || !optedIn || !status.cantStore || status.running || status === statusAtTurnOn.current) return;
    setOptedIn(false);
    setMeta(null);
    void setOptIn(uid, false).catch(() => {}).finally(() => notifyOptInChanged());
  }, [uid, optedIn, status]);

  if (!session || uid === null) return null;
  const signedIn = uid;
  const target = { uid: signedIn, householdId: session.householdId, displayName: session.displayName };
  const memoryOnly = !persistentAuthAllowed();
  const unableToStore = cantStore || (status.cantStore && !status.running);

  async function turnOn() {
    setCantStore(false);
    try {
      await setOptIn(signedIn, true);
    } catch {
      setCantStore(true);
      return;
    }
    statusAtTurnOn.current = status;
    setOptedIn(true);
    notifyOptInChanged(); // AuthProvider starts the first download and the triggers
    const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
    const granted = storage?.persist ? await storage.persist().catch(() => false) : false;
    setPersistWarning(!granted);
  }

  async function turnOff() {
    await setOptIn(signedIn, false).catch(() => {});
    await clearCopy().catch(() => {});
    setOptedIn(false);
    setMeta(null);
    setConfirmingOff(false);
    setPersistWarning(false);
    notifyOptInChanged();
  }

  async function clearDevice() {
    const { failed } = await clearDeviceData();
    setClearResult(failed.length === 0 ? "ok" : "failed");
    setOptedIn(await getOptIn(signedIn).catch(() => false));
    setMeta(null);
    notifyOptInChanged();
  }

  let line: string;
  if (!optedIn) line = "Not stored on this device.";
  else if (status.lastFailure) line = meta ? `Last update failed · copy from ${formatCopyTime(meta.downloadedAt)}` : "Not ready offline";
  else if (meta) line = `Ready offline · updated ${formatCopyTime(meta.downloadedAt)}`;
  else line = status.running ? "Downloading…" : "Not ready offline";

  return (
    <section className="offline-section" data-testid="offline-section" aria-labelledby="offline-title">
      <h3 id="offline-title">Offline copy</h3>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          data-testid="offline-switch"
          checked={optedIn}
          disabled={memoryOnly || confirmingOff}
          onChange={(e) => { if (e.target.checked) void turnOn(); else setConfirmingOff(true); }}
        />
        Keep a copy on this device
      </label>
      {memoryOnly && <p className="hint" data-testid="offline-memory-only">Offline copies need sign-in to be saved on this device.</p>}
      {unableToStore && <p role="alert" data-testid="offline-cant-store">This device can't store an offline copy.</p>}
      <p data-testid="offline-status">{line}</p>
      {optedIn && status.lastFailure && (
        <p className="hint">
          <span data-testid="offline-reason">{REASON[status.lastFailure]}</span>{" "}
          <button type="button" data-testid="offline-retry" onClick={() => void refresher.requestFull(target)}>Try again</button>
        </p>
      )}
      {confirmingOff && (
        <div className="notice" role="group" aria-labelledby="offline-remove-q">
          <p id="offline-remove-q" data-testid="offline-remove-question">Remove the offline copy from this device?</p>
          <div className="actions">
            <button type="button" data-testid="offline-remove-confirm" onClick={() => void turnOff()}>Remove</button>
            <button type="button" data-testid="offline-remove-cancel" onClick={() => setConfirmingOff(false)}>Keep</button>
          </div>
        </div>
      )}
      {optedIn && (
        <button type="button" data-testid="offline-refresh" disabled={!connected || state.status !== "member" || status.running} onClick={() => void refresher.requestFull(target)}>
          Refresh now
        </button>
      )}
      {persistWarning && <p className="hint" data-testid="offline-persist-warning">Your browser may remove this copy if the device runs low on space.</p>}
      <p className="hint">Works best in the app installed on your Home Screen. In a browser tab, the browser may remove the copy after a week without use.</p>
      <div className="actions">
        <button type="button" data-testid="device-clear" onClick={() => void clearDevice()}>Clear device data</button>
        {clearResult && (
          <span role="status" data-testid="device-clear-result">
            {clearResult === "ok" ? "Data on this device was cleared." : "Some data on this device couldn't be cleared."}
          </span>
        )}
      </div>
    </section>
  );
}
