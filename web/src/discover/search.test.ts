import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveryResponse } from "./api";

vi.mock("./api", () => ({
  searchDestination: vi.fn(),
  searchNearby: vi.fn(),
  classifySearchError: (err: unknown) => {
    if ((err as { name?: unknown } | null)?.name === "TimeoutError") return "timeout";
    return (err as { code?: string })?.code === "functions/failed-precondition" ? "off" : "unavailable";
  },
}));

import { CLIENT_TIMEOUT_MS, createSearchController, labelFor, useDiscoverySearch, type SearchRun, type SearchState } from "./search";

const result = { placeId: "p1", name: "Casa", address: "1 Rua", googleMapsUri: "https://maps.google.com/?cid=1" };
const ok = (results = [result]): DiscoveryResponse => ({ results, provider: "google" });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(overrides: { isOnline?: () => boolean; timeoutMs?: number } = {}) {
  const calls: Array<{ run: SearchRun; d: ReturnType<typeof deferred<DiscoveryResponse>> }> = [];
  const states: SearchState[] = [];
  const controller = createSearchController({
    onChange: (s) => states.push(s),
    call: (run) => {
      const d = deferred<DiscoveryResponse>();
      calls.push({ run, d });
      return d.promise;
    },
    isOnline: overrides.isOnline ?? (() => true),
    timeoutMs: overrides.timeoutMs,
  });
  return { controller, calls, states, last: () => states[states.length - 1] };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("labelFor", () => {
  it("uses the query for destination searches and 'near you' for nearby", () => {
    expect(labelFor({ kind: "destination", query: "Lisbon" })).toBe("Lisbon");
    expect(labelFor({ kind: "nearby", lat: 1, lng: 2 })).toBe("near you");
  });
});

describe("createSearchController", () => {
  it("goes searching → results", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "Lisbon" });
    expect(h.last()).toEqual({ status: "searching", label: "Lisbon" });
    h.calls[0]!.d.resolve(ok());
    await flush();
    expect(h.last()).toEqual({ status: "results", label: "Lisbon", results: [result] });
  });

  it("goes searching → empty when there are no results", async () => {
    const h = harness();
    h.controller.submit({ kind: "nearby", lat: 51.5, lng: -0.12 });
    h.calls[0]!.d.resolve(ok([]));
    await flush();
    expect(h.last()).toEqual({ status: "empty", label: "near you" });
  });

  it("drops a late response for a superseded search", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "slow" });
    h.controller.submit({ kind: "destination", query: "fast" });
    h.calls[1]!.d.resolve(ok([{ ...result, name: "Fast" }]));
    await flush();
    expect(h.last()).toMatchObject({ status: "results", label: "fast" });
    h.calls[0]!.d.resolve(ok([{ ...result, name: "Slow" }]));
    await flush();
    expect(h.last()).toMatchObject({ status: "results", label: "fast", results: [{ name: "Fast" }] });
  });

  it("drops a late error for a superseded search", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "first" });
    h.controller.submit({ kind: "destination", query: "second" });
    h.calls[0]!.d.reject(Object.assign(new Error("x"), { code: "functions/failed-precondition" }));
    await flush();
    expect(h.last()).toEqual({ status: "searching", label: "second" });
  });

  it("maps a rejected call to an error state", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "q" });
    h.calls[0]!.d.reject(Object.assign(new Error("x"), { code: "functions/failed-precondition" }));
    await flush();
    expect(h.last()).toEqual({ status: "error", label: "q", reason: "off" });
  });

  it("short-circuits to offline without calling when the browser is offline", () => {
    const h = harness({ isOnline: () => false });
    h.controller.submit({ kind: "destination", query: "q" });
    expect(h.calls).toHaveLength(0);
    expect(h.last()).toEqual({ status: "error", label: "q", reason: "offline" });
  });

  it("times out a call that never answers", async () => {
    const h = harness({ timeoutMs: 30 });
    h.controller.submit({ kind: "destination", query: "q" });
    await new Promise((r) => setTimeout(r, 80));
    expect(h.last()).toEqual({ status: "error", label: "q", reason: "timeout" });
  });

  it("fail() reports a location reason and supersedes any in-flight search", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "q" });
    h.controller.fail("locationDenied", "near you");
    expect(h.last()).toEqual({ status: "error", label: "near you", reason: "locationDenied" });
    h.calls[0]!.d.resolve(ok());
    await flush();
    expect(h.last()).toEqual({ status: "error", label: "near you", reason: "locationDenied" });
  });

  it("cancel() leaves the last state alone and ignores the in-flight outcome", async () => {
    const h = harness();
    h.controller.submit({ kind: "destination", query: "q" });
    h.controller.cancel();
    h.calls[0]!.d.resolve(ok());
    await flush();
    expect(h.last()).toEqual({ status: "searching", label: "q" });
  });

  it("uses a 20 second default timeout", () => {
    expect(CLIENT_TIMEOUT_MS).toBe(20_000);
  });
});

describe("useDiscoverySearch", () => {
  it("exposes the state and the two submit helpers", async () => {
    const call = vi.fn(async () => ok());
    const { result: hook } = renderHook(() => useDiscoverySearch({ call }));
    expect(hook.current.state).toEqual({ status: "idle" });
    await act(async () => { hook.current.submitDestination("Lisbon"); await flush(); });
    expect(call).toHaveBeenCalledWith({ kind: "destination", query: "Lisbon" });
    expect(hook.current.state).toMatchObject({ status: "results", label: "Lisbon" });
    await act(async () => { hook.current.submitNearby(51.5, -0.12); await flush(); });
    expect(call).toHaveBeenLastCalledWith({ kind: "nearby", lat: 51.5, lng: -0.12 });
  });
});
