import { useSyncExternalStore } from "react";
import { getCopySession, isServingCopy, subscribeCopySession } from "./session";

/** True while this document shows any copy data (offlineMember, or a watcher serving the copy). */
export function useCopyServing(): boolean {
  return useSyncExternalStore(subscribeCopySession, isServingCopy, isServingCopy);
}

const readMode = (): "member" | "offlineMember" | null => getCopySession()?.mode ?? null;

export function useCopyMode(): "member" | "offlineMember" | null {
  return useSyncExternalStore(subscribeCopySession, readMode, readMode);
}
