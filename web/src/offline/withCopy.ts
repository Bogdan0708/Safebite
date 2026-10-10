import type { Snapshot } from "../records/repository"; // type only: erased, no Firebase at run time
import { beginServingCopy, getCopySession, loadUsableCopy, reportDenied } from "./session";
import type { CopyData } from "./types";

export const NOT_IN_COPY = "You are offline and this restaurant has not been loaded on this device.";

/**
 * Rule (spec §3.9 "Read source"): the UI shows the server or the copy, never the memory cache,
 * whenever a usable copy exists. Wraps a live watcher; `select` maps the copy to this query's
 * snapshot. In offlineMember no listener is created. A listener denial is reported so
 * AuthProvider re-reads membership (review R2-4).
 *
 * The serving lease is held only while copy *data* is shown: a not-in-copy error is not serving
 * a copy (m15). It is released exactly once when server data, a fallback or an error replaces
 * the copy, and on unsubscribe.
 */
export function withCopy<T>(
  live: (cb: (s: Snapshot<T>) => void) => () => void,
  select: (copy: CopyData) => Snapshot<T>,
): (cb: (s: Snapshot<T>) => void) => () => void {
  return (cb) => {
    let closed = false;
    let seq = 0;
    let release: (() => void) | null = null;
    const stopServing = () => {
      release?.();
      release = null;
    };
    const serveCopy = async (fallback: Snapshot<T>, mine: number) => {
      const copy = await loadUsableCopy();
      if (closed || mine !== seq) return; // closed, or a newer snapshot arrived meanwhile
      if (!copy) {
        stopServing();
        cb(fallback);
        return;
      }
      const snap = select(copy.data);
      if (snap.status === "ready" || snap.status === "offline") release ??= beginServingCopy();
      else stopServing();
      cb(snap);
    };

    if (getCopySession()?.mode === "offlineMember") {
      void serveCopy({ status: "error", message: NOT_IN_COPY, cacheMiss: true }, seq);
      return () => {
        closed = true;
        stopServing();
      };
    }

    const unsubscribe = live((s) => {
      const mine = ++seq;
      const fromCache = s.status === "offline" || (s.status === "error" && s.cacheMiss === true);
      if (fromCache && getCopySession() !== null) {
        void serveCopy(s, mine);
        return;
      }
      stopServing();
      if (s.status === "denied") reportDenied();
      cb(s);
    });
    return () => {
      closed = true;
      stopServing();
      unsubscribe();
    };
  };
}
