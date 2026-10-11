import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./repository";
import { useWatch } from "./useWatch";
import { ReadStateNotice } from "./ReadStateNotice";
import { isServingCopy, setCopySession } from "../offline/session";

vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

function Probe({ sub }: { sub: (cb: (s: Snapshot<string[]>) => void) => () => void }) {
  const { state, retry } = useWatch<string[]>(sub, ["home"]);
  return <ReadStateNotice state={state} onRetry={retry} />;
}

describe("useWatch bridges the copy across offlineMember → member", () => {
  it("serves the copy until the new listener first emits, so the offline notice never flashes", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
    const emitters: Array<(s: Snapshot<string[]>) => void> = [];
    render(<Probe sub={(cb) => { emitters.push(cb); return () => {}; }} />);
    act(() => emitters[0]!({ status: "offline", source: "copy", value: ["from-copy"] }));
    act(() => setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" }));
    expect(emitters).toHaveLength(2);
    expect(isServingCopy()).toBe(true);
    expect(screen.queryByTestId("read-offline")).toBeNull();
    act(() => emitters[1]!({ status: "ready", value: ["live"] }));
    expect(isServingCopy()).toBe(false);
    act(() => emitters[1]!({ status: "ready", value: ["live"] }));
    expect(isServingCopy()).toBe(false);
    act(() => setCopySession(null));
  });

  it("releases the bridge lease exactly once on unmount before any emission", () => {
    setCopySession({ uid: "ava-uid", householdId: "home", mode: "offlineMember" });
    const emitters: Array<(s: Snapshot<string[]>) => void> = [];
    const { unmount } = render(<Probe sub={(cb) => { emitters.push(cb); return () => {}; }} />);
    act(() => emitters[0]!({ status: "offline", source: "copy", value: ["from-copy"] }));
    act(() => setCopySession({ uid: "ava-uid", householdId: "home", mode: "member" }));
    expect(isServingCopy()).toBe(true);
    unmount();
    expect(isServingCopy()).toBe(false);
    act(() => setCopySession(null));
  });
});

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
