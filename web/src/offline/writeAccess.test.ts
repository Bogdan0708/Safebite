import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginServingCopy, setCopySession } from "./session";
import { canWrite, isConnected, useWriteAccess } from "./writeAccess";

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
  setCopySession(null);
});

describe("canWrite (review R2-6)", () => {
  it("is true for an online member showing live data", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" });
    expect(canWrite()).toBe(true);
    expect(isConnected()).toBe(true);
  });
  it("is false in offlineMember", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
    expect(canWrite()).toBe(false);
    expect(isConnected()).toBe(false);
  });
  it("is false while any watcher serves copy data", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" });
    const release = beginServingCopy();
    expect(canWrite()).toBe(false);
    release();
    expect(canWrite()).toBe(true);
  });
  it("is false while the browser reports offline, and the hook follows the events", () => {
    const { result } = renderHook(() => useWriteAccess());
    expect(result.current).toBe(true);
    setOnline(false);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(result.current).toBe(false);
    setOnline(true);
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(result.current).toBe(true);
  });
});
