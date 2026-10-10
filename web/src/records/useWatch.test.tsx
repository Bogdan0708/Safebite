import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "./repository";
import { useWatch } from "./useWatch";
import { setCopySession } from "../offline/session";

describe("useWatch and the copy session", () => {
  it("re-subscribes on offlineMember → member and keeps the copy value instead of flashing loading", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
    const emitters: Array<(s: Snapshot<string[]>) => void> = [];
    const { result } = renderHook(() => useWatch<string[]>((cb) => { emitters.push(cb); return () => {}; }, ["home"]));
    act(() => emitters[0]!({ status: "offline", source: "copy", value: ["from-copy"] }));
    act(() => setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" }));
    expect(emitters).toHaveLength(2);
    expect(result.current.state).toEqual({ status: "offline", source: "copy", value: ["from-copy"] });
    act(() => emitters[1]!({ status: "ready", value: ["live"] }));
    expect(result.current.state).toEqual({ status: "ready", value: ["live"] });
    act(() => setCopySession(null));
  });

  it("a deps change shows loading, never the previous query's copy value", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
    const emitters: Array<(s: Snapshot<string[]>) => void> = [];
    const { result, rerender } = renderHook(({ rid }) => useWatch<string[]>((cb) => { emitters.push(cb); return () => {}; }, [rid]), { initialProps: { rid: "a" } });
    act(() => emitters[0]!({ status: "offline", source: "copy", value: ["a-from-copy"] }));
    rerender({ rid: "b" });
    expect(emitters).toHaveLength(2);
    expect(result.current.state).toEqual({ status: "loading" });
    act(() => setCopySession(null));
  });
});
