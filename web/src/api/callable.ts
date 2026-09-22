import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/** A typed callable that resolves to the response data (not the SDK's `{ data }` wrapper). */
export function callable<Req, Res>(name: string): (data: Req) => Promise<Res> {
  const call = httpsCallable<Req, Res>(functions, name);
  return async (data: Req) => (await call(data)).data;
}

/**
 * Cancellation semantics for a promise that cannot itself be cancelled (the Firebase callable
 * SDK exposes no AbortSignal): once `signal` fires, the returned promise rejects with the
 * signal's own `reason` (an AbortError DOMException when none was given, a TimeoutError when
 * the signal came from AbortSignal.timeout) and the underlying promise's later outcome is
 * ignored. Preserving the reason is what lets a caller tell a timeout from a user abort.
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
  const reasonOf = (): unknown => (signal.reason === undefined ? new DOMException("Aborted", "AbortError") : signal.reason);
  if (signal.aborted) {
    // Drain the underlying promise so its later rejection (if any) doesn't surface as an
    // unhandled promise rejection now that nothing else is attached to it.
    promise.catch(() => {});
    return Promise.reject(reasonOf());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(reasonOf());
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

/**
 * A signal that aborts as soon as any source does, carrying that source's reason. Hand-written
 * because `AbortSignal.any` only arrived in iOS 17.4 and the app targets iOS 17.
 */
export function anySignal(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      return controller.signal;
    }
  }
  const onAbort = (event: Event) => {
    for (const s of signals) s.removeEventListener("abort", onAbort);
    controller.abort((event.target as AbortSignal).reason);
  };
  for (const s of signals) s.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

/**
 * Structural on purpose: DOMException instances cross realms (Vitest+jsdom hands Node's signals
 * to jsdom's globals), so neither `instanceof DOMException` nor `instanceof Error` holds in both
 * directions. The spec-defined `name` is the discriminator.
 */
function isNamedError(err: unknown, name: string): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === name;
}

export function isAbortError(err: unknown): boolean {
  return isNamedError(err, "AbortError");
}

export function isTimeoutError(err: unknown): boolean {
  return isNamedError(err, "TimeoutError");
}
