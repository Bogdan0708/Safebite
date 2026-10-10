import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLEANER_TIMEOUT_MS, PENDING_CLEAR_KEY, PENDING_CLEAR_PREFIX, _resetDeviceCleanersForTests, clearDeviceData, pendingClear, pendingClearKeys, registerDeviceCleaner, retirePendingClearKeys } from "./cleanup";

beforeEach(() => {
  _resetDeviceCleanersForTests();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("clearDeviceData", () => {
  it("runs every cleaner, clears the marker on success and reports no failures", async () => {
    const a = vi.fn(async () => {});
    const b = vi.fn(async () => {});
    registerDeviceCleaner({ name: "a", clear: a });
    registerDeviceCleaner({ name: "b", clear: b });
    registerDeviceCleaner({ name: "a", clear: a }); // duplicate name: ignored
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(pendingClear()).toBe(false);
  });

  it("with no cleaners (5a) it succeeds immediately", async () => {
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(localStorage.getItem(PENDING_CLEAR_KEY)).toBeNull();
  });

  it("names a failing cleaner, still runs the others, never throws, and leaves the marker set", async () => {
    const ok = vi.fn(async () => {});
    registerDeviceCleaner({ name: "broken", clear: async () => { throw new Error("nope"); } });
    registerDeviceCleaner({ name: "ok", clear: ok });
    await expect(clearDeviceData()).resolves.toEqual({ failed: ["broken"] });
    expect(ok).toHaveBeenCalled();
    expect(pendingClear()).toBe(true);
  });

  it("a cleaner that throws synchronously is reported, not propagated", async () => {
    registerDeviceCleaner({ name: "sync", clear: () => { throw new Error("sync"); } });
    await expect(clearDeviceData()).resolves.toEqual({ failed: ["sync"] });
  });

  it("a hanging cleaner times out after 5 s and is reported", async () => {
    vi.useFakeTimers();
    registerDeviceCleaner({ name: "hang", clear: () => new Promise<void>(() => {}) });
    const result = clearDeviceData();
    await vi.advanceTimersByTimeAsync(CLEANER_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ failed: ["hang"] });
    expect(pendingClear()).toBe(true);
  });

  it("storage that throws does not break clearing or the marker check (Review Focus 4)", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    const c = vi.fn(async () => {});
    registerDeviceCleaner({ name: "c", clear: c });
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(c).toHaveBeenCalled();
    expect(pendingClear()).toBe(false);
  });
});

describe("per-run pending-clear keys (spec §3.9, review P3-8)", () => {
  it("each run writes its own key and removes only that key on success", async () => {
    let seen: string[] = [];
    registerDeviceCleaner({ name: "spy", clear: async () => { seen = pendingClearKeys(); } });
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.startsWith(PENDING_CLEAR_PREFIX)).toBe(true);
    expect(pendingClearKeys()).toEqual([]);
  });

  it("two concurrent runs: the failing run's key survives the other run's success", async () => {
    let calls = 0;
    registerDeviceCleaner({ name: "flaky", clear: async () => { calls += 1; if (calls === 1) throw new Error("first run fails"); } });
    const [a, b] = await Promise.all([clearDeviceData(), clearDeviceData()]);
    expect(a).toEqual({ failed: ["flaky"] });
    expect(b).toEqual({ failed: [] });
    expect(pendingClear()).toBe(true);
    expect(pendingClearKeys()).toHaveLength(1);
  });

  it("honours and retires the legacy marker", () => {
    localStorage.setItem(PENDING_CLEAR_KEY, "1");
    expect(pendingClear()).toBe(true);
    retirePendingClearKeys(pendingClearKeys());
    expect(pendingClear()).toBe(false);
  });

  it("retiring a captured set leaves keys written afterwards", () => {
    localStorage.setItem(`${PENDING_CLEAR_PREFIX}old`, "1");
    const captured = pendingClearKeys();
    localStorage.setItem(`${PENDING_CLEAR_PREFIX}new`, "1");
    retirePendingClearKeys(captured);
    expect(pendingClearKeys()).toEqual([`${PENDING_CLEAR_PREFIX}new`]);
  });

  it("blocked storage never throws: no keys, nothing pending", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => retirePendingClearKeys(["x"])).not.toThrow();
    return expect(clearDeviceData()).resolves.toEqual({ failed: [] });
  });
});
