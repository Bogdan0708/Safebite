import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/** A typed callable that resolves to the response data (not the SDK's `{ data }` wrapper). */
export function callable<Req, Res>(name: string): (data: Req) => Promise<Res> {
  const call = httpsCallable<Req, Res>(functions, name);
  return async (data: Req) => (await call(data)).data;
}

/**
 * Cancellation semantics for a promise that cannot itself be cancelled (the Firebase callable
 * SDK exposes no AbortSignal): once `signal` fires, the returned promise rejects with an
 * AbortError and the underlying promise's later outcome is ignored.
 *
 * The underlying callable is NOT cancelled: it keeps running on the client and server, and any
 * paid upstream call it makes is still billed. `abortable` only changes which outcome this
 * caller observes.
 *
 * Intended pattern for searches: one `AbortController` per submission — abort the previous
 * controller when the next submit fires, so a slow, superseded response can never overwrite a
 * newer one.
 *
 * `SettingsPage`'s ref-held promise is the opposite pattern: it reuses one in-flight request
 * across React StrictMode remounts instead of superseding it. Do not copy that pattern for
 * searches, where each submission must be independently abortable.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    // Drain the underlying promise so its later rejection (if any) doesn't surface as an
    // unhandled promise rejection now that nothing else is attached to it.
    promise.catch(() => {});
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) reject(err);
      },
    );
  });
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
