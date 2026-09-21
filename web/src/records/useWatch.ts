import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "./repository";

export type WatchState<T> = Snapshot<T> | { status: "loading" };

/**
 * Subscribes to a repository watcher for the lifetime of `deps`; callbacks from a superseded
 * subscription are ignored (generation counter, as in AuthProvider), so an account or route
 * change can never paint stale data. `retry` tears down and re-subscribes.
 */
export function useWatch<T>(subscribe: (cb: (s: Snapshot<T>) => void) => () => void, deps: readonly unknown[]): { state: WatchState<T>; retry: () => void } {
  const [state, setState] = useState<WatchState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const mine = ++generation.current;
    setState({ status: "loading" });
    const unsubscribe = subscribe((s) => {
      if (mine === generation.current) setState(s);
    });
    return () => {
      generation.current += 1;
      unsubscribe();
    };
    // `subscribe` is recreated each render by callers; the real inputs are `deps` and `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}
