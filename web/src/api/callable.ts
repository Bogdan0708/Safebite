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
