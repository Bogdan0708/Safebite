import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ state: { status: "loading" } as Record<string, unknown> }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ state: m.state }) }));

import { useMember } from "./useMember";

describe("useMember", () => {
  it("accepts offlineMember and returns the copy's identity", () => {
    m.state = { status: "offlineMember", uid: "ava-uid", email: null, householdId: "home", displayName: "Ava", downloadedAt: 1 };
    expect(renderHook(() => useMember()).result.current).toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava" });
  });
  it("still refuses anything else", () => {
    m.state = { status: "signedOut" };
    expect(() => renderHook(() => useMember())).toThrow("useMember used outside a member session");
  });
});
