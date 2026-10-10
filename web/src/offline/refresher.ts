import { useSyncExternalStore } from "react";
import { readHouseholdFromServer, readRestaurantFromServer, RefreshDenied, RefreshOffline, type ReadStats } from "./serverReads";
import { reportDenied } from "./session";
import { readMeta, readToken, replaceCopy, replaceRestaurant } from "./store";
import type { CopyData, RestaurantData } from "./types";

/** Keeps the copy current (spec §3.9 "Refresh"): single flight, at most one extra run, stale work re-run. */
export type RefreshFailure = "offline" | "storage" | "server" | "denied";
export interface RefreshStatus { running: boolean; lastFailure: RefreshFailure | null; lastWrittenAt: number | null; cantStore: boolean }
export interface RefreshTarget { uid: string; householdId: string; displayName: string }

export interface RefresherDeps {
  readHousehold(hid: string): Promise<{ data: CopyData; stats: ReadStats }>;
  readRestaurant(hid: string, rid: string): Promise<{ data: RestaurantData | null; stats: ReadStats }>;
  now(): number;
  /** A permission-denied read: AuthProvider re-reads membership; never a wipe by itself. */
  onDenied(): void;
  /** Test-only pause between the server reads and the write (browser test 5). */
  pause(): Promise<void>;
}

export interface Refresher {
  requestFull(target: RefreshTarget): Promise<void>;
  requestPartial(target: RefreshTarget, rid: string): Promise<void>;
  status(): RefreshStatus;
  subscribe(cb: () => void): () => void;
  lastStats(): ReadStats | null;
}

/** Bounds re-runs when other tabs keep winning. */
const MAX_STALE_RETRIES = 3;

export function createRefresher(deps: RefresherDeps): Refresher {
  let status: RefreshStatus = { running: false, lastFailure: null, lastWrittenAt: null, cantStore: false };
  let stats: ReadStats | null = null;
  let target: RefreshTarget | null = null;
  let fullPending = false;
  const partialsPending = new Set<string>();
  let running: Promise<void> | null = null;
  const subscribers = new Set<() => void>();

  const set = (next: Partial<RefreshStatus>) => {
    status = { ...status, ...next };
    for (const cb of subscribers) cb();
  };

  function failureOf(err: unknown): RefreshFailure {
    if (err instanceof RefreshDenied) return "denied";
    if (err instanceof RefreshOffline) return "offline";
    return "server";
  }

  async function runFull(t: RefreshTarget): Promise<"done" | "stale"> {
    const token = await readToken().catch(() => null);
    if (!token) { set({ lastFailure: "storage" }); return "done"; }
    let read: { data: CopyData; stats: ReadStats };
    try {
      read = await deps.readHousehold(t.householdId);
    } catch (err) {
      const failure = failureOf(err);
      set({ lastFailure: failure });
      if (failure === "denied") deps.onDenied();
      return "done";
    }
    await deps.pause();
    const result = await replaceCopy(t, token, read.data, deps.now());
    switch (result) {
      case "written":
        stats = read.stats;
        set({ lastFailure: null, lastWrittenAt: deps.now(), cantStore: false });
        return "done";
      case "stale":
        return "stale";
      case "storageFull":
      case "unavailable":
        set({ lastFailure: "storage", cantStore: (await readMeta()) === null });
        return "done";
      default:
        // cleared, optedOut, otherCopy: cleanup won; nothing to report.
        return "done";
    }
  }

  async function runPartial(t: RefreshTarget, rid: string): Promise<"done" | "stale"> {
    const token = await readToken().catch(() => null);
    if (!token) return "done";
    let read: { data: RestaurantData | null };
    try {
      read = await deps.readRestaurant(t.householdId, rid);
    } catch (err) {
      const failure = failureOf(err);
      set({ lastFailure: failure });
      if (failure === "denied") deps.onDenied();
      return "done";
    }
    await deps.pause();
    const result = await replaceRestaurant(t, token, rid, read.data);
    return result === "stale" ? "stale" : "done";
  }

  async function loop(): Promise<void> {
    set({ running: true });
    let staleRetries = 0;
    try {
      while (target && (fullPending || partialsPending.size > 0)) {
        const t = target;
        if (fullPending) {
          fullPending = false;
          partialsPending.clear(); // a full refresh covers every partial
          if ((await runFull(t)) === "stale" && staleRetries++ < MAX_STALE_RETRIES) fullPending = true;
        } else {
          const rid = partialsPending.values().next().value as string;
          partialsPending.delete(rid);
          if ((await runPartial(t, rid)) === "stale" && staleRetries++ < MAX_STALE_RETRIES) partialsPending.add(rid);
        }
      }
    } finally {
      set({ running: false });
    }
  }

  function kick(): Promise<void> {
    if (!running) running = loop().finally(() => { running = null; });
    return running;
  }

  return {
    requestFull(t) {
      target = t;
      fullPending = true;
      return kick();
    },
    requestPartial(t, rid) {
      target = t;
      partialsPending.add(rid);
      return kick();
    },
    status: () => status,
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    lastStats: () => stats,
  };
}

async function devPause(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const hook = (globalThis as { __SAFEBITE_REFRESH_PAUSE__?: () => Promise<void> }).__SAFEBITE_REFRESH_PAUSE__;
  if (hook) await hook();
}

export const refresher: Refresher = createRefresher({
  readHousehold: readHouseholdFromServer,
  readRestaurant: readRestaurantFromServer,
  now: () => Date.now(),
  onDenied: reportDenied,
  pause: devPause,
});

export function useRefreshStatus(): RefreshStatus {
  return useSyncExternalStore(refresher.subscribe, refresher.status, refresher.status);
}

let optInVersion = 0;
const optInSubscribers = new Set<() => void>();
/** Settings calls this after changing the switch, so AuthProvider starts or stops the triggers. */
export function notifyOptInChanged(): void {
  optInVersion += 1;
  for (const cb of optInSubscribers) cb();
}
function subscribeOptIn(cb: () => void): () => void {
  optInSubscribers.add(cb);
  return () => {
    optInSubscribers.delete(cb);
  };
}
const optInSnapshot = () => optInVersion;
export function useOptInVersion(): number {
  return useSyncExternalStore(subscribeOptIn, optInSnapshot, optInSnapshot);
}
