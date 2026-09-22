import { useEffect, useRef, useState } from "react";
import { abortable, anySignal, isAbortError } from "../api/callable";
import { classifySearchError, searchDestination, searchNearby, type DiscoveryResponse, type DiscoveryResult, type SearchErrorReason } from "./api";

/** Server-side fetch is 8 s; cold starts add several seconds on top (spec §3.6 decisions). */
export const CLIENT_TIMEOUT_MS = 20_000;

export type SearchRun = { kind: "destination"; query: string } | { kind: "nearby"; lat: number; lng: number };

export type SearchState =
  | { status: "idle" }
  | { status: "searching"; label: string }
  | { status: "results"; label: string; results: DiscoveryResult[] }
  | { status: "empty"; label: string }
  | { status: "error"; label: string; reason: SearchErrorReason };

export function labelFor(run: SearchRun): string {
  return run.kind === "destination" ? run.query : "near you";
}

export interface SearchController {
  submit(run: SearchRun): void;
  /** Report a client-side failure (location) as the current outcome, superseding any search. */
  fail(reason: SearchErrorReason, label: string): void;
  /** Ignore the in-flight outcome (unmount). The controller stays usable. */
  cancel(): void;
}

export interface ControllerOptions {
  onChange: (state: SearchState) => void;
  call?: (run: SearchRun) => Promise<DiscoveryResponse>;
  isOnline?: () => boolean;
  timeoutMs?: number;
}

const defaultCall = (run: SearchRun): Promise<DiscoveryResponse> =>
  run.kind === "destination" ? searchDestination({ query: run.query }) : searchNearby({ lat: run.lat, lng: run.lng });

/**
 * One AbortController per submission; each submit takes a sequence number and aborts the previous
 * controller, and an outcome is applied only if its sequence number is still current. So a slow,
 * superseded response can never replace a newer one (spec §2.5, §3.6). The callable itself is not
 * cancelled (see abortable()); only what this page observes changes.
 */
export function createSearchController(options: ControllerOptions): SearchController {
  const call = options.call ?? defaultCall;
  const isOnline = options.isOnline ?? (() => navigator.onLine);
  const timeoutMs = options.timeoutMs ?? CLIENT_TIMEOUT_MS;
  let seq = 0;
  let current: AbortController | null = null;

  const supersede = (): number => {
    current?.abort(new DOMException("Superseded", "AbortError"));
    current = null;
    return ++seq;
  };

  return {
    submit(run) {
      const mine = supersede();
      const label = labelFor(run);
      if (!isOnline()) {
        options.onChange({ status: "error", label, reason: "offline" });
        return;
      }
      const controller = new AbortController();
      current = controller;
      options.onChange({ status: "searching", label });
      const signal = anySignal(controller.signal, AbortSignal.timeout(timeoutMs));
      abortable(call(run), signal).then(
        (response) => {
          if (mine !== seq) return;
          options.onChange(response.results.length > 0 ? { status: "results", label, results: response.results } : { status: "empty", label });
        },
        (err: unknown) => {
          if (mine !== seq) return;
          if (isAbortError(err)) return;
          options.onChange({ status: "error", label, reason: classifySearchError(err) });
        },
      );
    },
    fail(reason, label) {
      supersede();
      options.onChange({ status: "error", label, reason });
    },
    cancel() {
      supersede();
    },
  };
}

export function useDiscoverySearch(options: Pick<ControllerOptions, "call"> = {}): {
  state: SearchState;
  submitDestination(query: string): void;
  submitNearby(lat: number, lng: number): void;
  fail(reason: SearchErrorReason, label: string): void;
} {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const controller = useRef<SearchController | null>(null);
  // Created once per mounted page; survives React StrictMode's simulated remount because refs do.
  controller.current ??= createSearchController({ onChange: setState, ...(options.call ? { call: options.call } : {}) });
  useEffect(() => () => controller.current?.cancel(), []);
  return {
    state,
    submitDestination: (query) => controller.current!.submit({ kind: "destination", query }),
    submitNearby: (lat, lng) => controller.current!.submit({ kind: "nearby", lat, lng }),
    fail: (reason, label) => controller.current!.fail(reason, label),
  };
}
