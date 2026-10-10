import { PENDING_CLEAR_KEY, PENDING_CLEAR_PREFIX } from "../device/cleanup";

/** Cross-tab invalidation of the offline copy (spec §3.9 "Cross-tab invalidation", review R2-5). */
export const OFFLINE_CHANNEL = "safebite-offline";

export function announceInvalidation(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(OFFLINE_CHANNEL);
    channel.postMessage({ type: "invalidated" });
    channel.close();
  } catch {
    // Not available: resume and pre-read checks still catch the change.
  }
}

/** Calls `cb` when another tab clears the copy, opts out, finds access revoked, or starts a device clear. */
export function onInvalidation(cb: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(OFFLINE_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if ((event.data as { type?: unknown } | null)?.type === "invalidated") cb();
      };
    } catch {
      channel = null;
    }
  }
  const onStorage = (event: StorageEvent) => {
    const key = event.key;
    if (key === null || event.newValue === null) return;
    if (key === PENDING_CLEAR_KEY || key.startsWith(PENDING_CLEAR_PREFIX)) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
