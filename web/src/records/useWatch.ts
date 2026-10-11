import { useCallback, useEffect, useRef, useState } from "react";
import { useCopyMode } from "../offline/hooks";
import { beginServingCopy } from "../offline/session";
import type { Snapshot } from "./repository";

export type WatchState<T> = Snapshot<T> | { status: "loading" };

/**
 * Subscribes to a repository watcher for the lifetime of `deps`; callbacks from a superseded
 * subscription are ignored (generation counter, as in AuthProvider), so an account or route
 * change can never paint stale data. `retry` tears down and re-subscribes. A copy-session mode
 * change (offlineMember → member) re-subscribes and keeps a copy value until the server answers
 * (spec §3.9 "Transition").
 */
export function useWatch<T>(subscribe: (cb: (s: Snapshot<T>) => void) => () => void, deps: readonly unknown[]): { state: WatchState<T>; retry: () => void } {
  const [state, setState] = useState<WatchState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef<WatchState<T>>(state);
  latest.current = state;
  const mode = useCopyMode();
  const generation = useRef(0);
  const lastInputs = useRef<readonly unknown[] | null>(null);
  const inputs = [...deps, attempt];
  useEffect(() => {
    const mine = ++generation.current;
    // Only the offlineMember → member switch keeps a copy value: a deps change or a retry is a
    // different query, whose loading state must not show the previous query's data.
    const previous = lastInputs.current;
    const modeSwitchOnly = mode === "member" && previous !== null && previous.length === inputs.length && previous.every((v, i) => Object.is(v, inputs[i]));
    lastInputs.current = inputs;
    const shown = latest.current;
    const keep = modeSwitchOnly && shown.status === "offline" && shown.source === "copy";
    // While the kept copy value is on screen this hook is serving the copy itself: the old
    // subscription's lease is gone, and without this one the "you are offline" notice and the
    // banner would flash until the new listener answers. Released exactly once (first emission or cleanup).
    let bridge: (() => void) | null = keep ? beginServingCopy() : null;
    const endBridge = () => {
      bridge?.();
      bridge = null;
    };
    if (!keep) setState({ status: "loading" });
    const unsubscribe = subscribe((s) => {
      if (mine !== generation.current) return;
      setState(s);
      endBridge();
    });
    return () => {
      generation.current += 1;
      endBridge();
      unsubscribe();
    };
    // `subscribe` is recreated each render by callers; the real inputs are `deps`, `attempt` and the copy mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...inputs, mode]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}
