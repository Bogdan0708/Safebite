import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRefreshTriggers } from "./refreshTriggers";
import { COPY_REFRESH_INTERVAL_MS } from "./types";

let visibility: DocumentVisibilityState = "visible";
beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startRefreshTriggers", () => {
  it("refreshes on reconnection", () => {
    const run = vi.fn();
    const stop = startRefreshTriggers(run, async () => 0);
    window.dispatchEvent(new Event("online"));
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it("on return, refreshes only a copy older than 30 minutes (or none)", async () => {
    const run = vi.fn();
    let age: number | null = COPY_REFRESH_INTERVAL_MS - 1;
    const stop = startRefreshTriggers(run, async () => age);
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    age = COPY_REFRESH_INTERVAL_MS + 1;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    age = null;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    stop();
  });

  it("an age read that answers after stop runs nothing (final review M5)", async () => {
    const run = vi.fn();
    let answer!: (age: number | null) => void;
    const stop = startRefreshTriggers(run, () => new Promise<number | null>((r) => { answer = r; }));
    document.dispatchEvent(new Event("visibilitychange"));
    stop();
    answer(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(run).not.toHaveBeenCalled();
  });

  it("the interval is 30 minutes (owner follow-up 2026-10-11)", () => {
    expect(COPY_REFRESH_INTERVAL_MS).toBe(30 * 60 * 1000);
  });

  it("the 30-minute timer always runs while visible and never while hidden (review R2-1)", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const stop = startRefreshTriggers(run, async () => 0);
    vi.advanceTimersByTime(COPY_REFRESH_INTERVAL_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    vi.advanceTimersByTime(COPY_REFRESH_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
    visibility = "visible";
    vi.advanceTimersByTime(COPY_REFRESH_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
