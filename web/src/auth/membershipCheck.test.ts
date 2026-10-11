import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDocFromServer: (ref: { path: string }) => read(ref.path),
}));

import { MEMBERSHIP_TIMEOUT_MS, membershipWithTimeout, readMembershipFromServer } from "./membershipCheck";

const snap = (data: Record<string, unknown> | undefined, fromCache = false) => ({ exists: () => data !== undefined, data: () => data, metadata: { fromCache } });
const err = (code: string) => Object.assign(new Error(code), { code });

function member() {
  read.mockImplementation(async (path: string) => {
    if (path === "users/ava-uid") return snap({ householdId: "home", displayName: "Ava" });
    if (path === "households/home") return snap({ memberIds: ["ava-uid"] });
    return snap(undefined);
  });
}

// vitest 5: a rejection returned by a bare, just-reset vi.fn() is reported as an unhandled error, so reset to a default implementation.
beforeEach(() => { read.mockReset(); read.mockImplementation(() => undefined); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("readMembershipFromServer", () => {
  it("answers member from server snapshots", async () => {
    member();
    await expect(readMembershipFromServer("ava-uid")).resolves.toEqual({ kind: "member", householdId: "home", displayName: "Ava" });
  });

  it("treats permission-denied as a server answer: not a member", async () => {
    read.mockRejectedValue(err("permission-denied"));
    await expect(readMembershipFromServer("x")).resolves.toEqual({ kind: "notMember", canDeleteSignIn: true });
  });

  it("answers deletionPending when the caller's deletion record exists", async () => {
    read.mockImplementation(async (path: string) => (path === "accountDeletions/x" ? snap({ step: 2 }) : snap(undefined)));
    await expect(readMembershipFromServer("x")).resolves.toEqual({ kind: "deletionPending" });
  });

  it.each(["unavailable", "deadline-exceeded"])("%s is no answer", async (code) => {
    read.mockRejectedValue(err(code));
    await expect(readMembershipFromServer("x")).resolves.toEqual({ kind: "noAnswer" });
  });

  it("a snapshot served from cache is never a server answer (review P1-1)", async () => {
    read.mockResolvedValue(snap({ householdId: "home", displayName: "Ava" }, true));
    await expect(readMembershipFromServer("ava-uid")).resolves.toEqual({ kind: "noAnswer" });
  });

  it("any other failure rejects", async () => {
    read.mockRejectedValue(err("internal"));
    await expect(readMembershipFromServer("x")).rejects.toThrow("internal");
  });
});

describe("membershipWithTimeout", () => {
  it("answers noAnswer at the timeout and still delivers the late answer", async () => {
    vi.useFakeTimers();
    let release!: (v: unknown) => void;
    read.mockImplementation((path: string) => (path === "users/ava-uid" ? new Promise((r) => { release = r; }) : Promise.resolve(snap({ memberIds: ["ava-uid"] }))));
    const { first, late } = membershipWithTimeout("ava-uid");
    await vi.advanceTimersByTimeAsync(MEMBERSHIP_TIMEOUT_MS - 1);
    let settled = false;
    void first.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toEqual({ kind: "noAnswer" });
    release(snap({ householdId: "home", displayName: "Ava" }));
    await expect(late).resolves.toEqual({ kind: "member", householdId: "home", displayName: "Ava" });
  });

  it("answers noAnswer at once when the browser reports offline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: false });
    read.mockImplementation(() => new Promise(() => {}));
    const { first } = membershipWithTimeout("ava-uid");
    await vi.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toEqual({ kind: "noAnswer" });
  });
});
