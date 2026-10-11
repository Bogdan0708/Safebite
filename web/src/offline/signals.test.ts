import { afterEach, describe, expect, it, vi } from "vitest";
import { announceInvalidation, onInvalidation } from "./signals";

afterEach(() => vi.restoreAllMocks());

describe("offline signals", () => {
  it("delivers an invalidation announced elsewhere in the browser", async () => {
    const cb = vi.fn();
    const stop = onInvalidation(cb);
    announceInvalidation();
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    stop();
  });

  it("treats a pending-clear key appearing in another tab as an invalidation", () => {
    const cb = vi.fn();
    const stop = onInvalidation(cb);
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.abc", newValue: "1" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear", newValue: "1" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.abc", newValue: null })); // removal: not a signal
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.deletedUids", newValue: "[]" }));
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
  });

  it("never throws when BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    expect(() => announceInvalidation()).not.toThrow();
    const stop = onInvalidation(vi.fn());
    expect(() => stop()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
