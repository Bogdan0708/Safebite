import { resetDocument } from "../auth/resetDocument";
import { clearDeviceData, pendingClear } from "../device/cleanup";
import { copyUsable } from "./eligibility";
import { onInvalidation } from "./signals";
import { getOptIn, readCopy } from "./store";
import { ELIGIBILITY_CHECK_MS, type CopyData, type CopyMeta } from "./types";

/**
 * This document's view of the offline copy (spec §3.9 "Read source", "Cross-tab invalidation").
 * AuthProvider sets the session; watchers take a lease while they show copy data. Firebase-free.
 */
export interface CopySession { uid: string; householdId: string; mode: "member" | "offlineMember" }

let session: CopySession | null = null;
let leases = 0;
let lastMeta: CopyMeta | null = null;
let version = 0;
const subscribers = new Set<() => void>();
let deniedHandler: (() => void) | null = null;

function notify(): void {
  version += 1;
  for (const cb of subscribers) cb();
}

export function setCopySession(next: CopySession | null): void {
  session = next;
  if (next === null) lastMeta = null;
  notify();
}

export function getCopySession(): CopySession | null {
  return session;
}

/** True while this document shows any copy data: always in offlineMember, else while a watcher holds a lease. */
export function isServingCopy(): boolean {
  return session?.mode === "offlineMember" || leases > 0;
}

export function beginServingCopy(): () => void {
  leases += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leases -= 1;
    notify();
  };
}

/** The meta of the copy last served in this document (for the banner's age). */
export function lastServedMeta(): CopyMeta | null {
  return lastMeta;
}

export function subscribeCopySession(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function copySessionVersion(): number {
  return version;
}

export function setDeniedHandler(handler: (() => void) | null): void {
  deniedHandler = handler;
}

/** A live listener reported permission-denied: AuthProvider re-reads membership from the server (review R2-4). */
export function reportDenied(): void {
  deniedHandler?.();
}

/** The usable copy for this session, or null. A malformed copy is wiped through the cleanup path. */
export async function loadUsableCopy(now: number = Date.now()): Promise<{ meta: CopyMeta; data: CopyData } | null> {
  const current = session;
  if (!current) return null;
  const read = await readCopy(current);
  if (read.kind === "malformed") {
    void clearDeviceData();
    return null;
  }
  if (read.kind !== "copy") return null;
  const usable = copyUsable(read.meta, current, await getOptIn(current.uid), pendingClear(), now);
  if (usable !== true) return null;
  if (lastMeta?.revision !== read.meta.revision || lastMeta.downloadedAt !== read.meta.downloadedAt) {
    lastMeta = read.meta;
    notify();
  }
  return { meta: read.meta, data: read.data };
}

/** Resets this document if it shows copy data that may no longer be shown. */
export async function checkServedCopy(now: number = Date.now()): Promise<void> {
  if (!isServingCopy()) return;
  const copy = await loadUsableCopy(now);
  if (copy === null && isServingCopy()) resetDocument();
}

/** Started once per document by AuthProvider. Returns a stop function. */
export function startCopyWatch(): () => void {
  const stopSignals = onInvalidation(() => {
    if (isServingCopy()) resetDocument();
  });
  const onResume = () => {
    if (document.visibilityState !== "hidden") void checkServedCopy();
  };
  document.addEventListener("visibilitychange", onResume);
  window.addEventListener("pageshow", onResume);
  const timer = setInterval(() => void checkServedCopy(), ELIGIBILITY_CHECK_MS);
  return () => {
    stopSignals();
    document.removeEventListener("visibilitychange", onResume);
    window.removeEventListener("pageshow", onResume);
    clearInterval(timer);
  };
}
