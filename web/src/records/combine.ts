import type { WatchState } from "./useWatch";

/**
 * Read states for views built from several listeners (spec §3.7 "Read states for joined data").
 * Precedence: denied, gone, error, loading, then offline if any side is cache-backed, else ready.
 * An error is never hidden behind the offline notice.
 */
export function isData<T>(s: WatchState<T>): s is Extract<WatchState<T>, { status: "ready" | "offline" }> {
  return s.status === "ready" || s.status === "offline";
}

export function anyOffline(...states: Array<WatchState<unknown>>): boolean {
  return states.some((s) => s.status === "offline");
}

export function combineStates<A, B>(a: WatchState<A>, b: WatchState<B>): WatchState<[A, B]> {
  if (a.status === "denied" || b.status === "denied") return { status: "denied" };
  if (a.status === "gone" || b.status === "gone") return { status: "gone" };
  if (a.status === "error") return { status: "error", message: a.message };
  if (b.status === "error") return { status: "error", message: b.message };
  if (!isData(a) || !isData(b)) return { status: "loading" };
  return { status: a.status === "offline" || b.status === "offline" ? "offline" : "ready", value: [a.value, b.value] };
}
