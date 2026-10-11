import { useSyncExternalStore } from "react";
import { getCopySession, isServingCopy, subscribeCopySession } from "./session";

/**
 * The single write gate (spec §3.9 "Write access", review R2-6): false in offlineMember, while any
 * watcher on the page shows copy data, and while the browser reports offline. Every write control
 * and every submit handler uses it; the server transaction stays the final guard. Firebase-free.
 */
function browserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function isConnected(): boolean {
  return browserOnline() && getCopySession()?.mode !== "offlineMember";
}

export function canWrite(): boolean {
  return isConnected() && !isServingCopy();
}

function subscribe(cb: () => void): () => void {
  const stop = subscribeCopySession(cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    stop();
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useWriteAccess(): boolean {
  return useSyncExternalStore(subscribe, canWrite, canWrite);
}

/** For actions that need the network but are not writes (Discover search). */
export function useConnectivity(): boolean {
  return useSyncExternalStore(subscribe, isConnected, isConnected);
}
