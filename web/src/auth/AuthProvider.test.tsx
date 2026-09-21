import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listeners, unsubscribes, getDocMock } = vi.hoisted(() => ({
  listeners: [] as Array<(user: unknown) => void>,
  unsubscribes: [] as Array<ReturnType<typeof vi.fn>>,
  getDocMock: vi.fn(),
}));

vi.mock("../firebase", () => ({ auth: {}, db: {}, functions: {}, usingEmulators: true }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    listeners.push(cb);
    const unsubscribe = vi.fn();
    unsubscribes.push(unsubscribe);
    return unsubscribe;
  },
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  getDoc: (ref: { path: string }) => getDocMock(ref.path),
}));

import { AuthProvider, useAuth } from "./AuthProvider";

function Probe() {
  const { state } = useAuth();
  return <div data-testid="state">{JSON.stringify(state)}</div>;
}

function snap(data: Record<string, unknown> | undefined) {
  return { exists: () => data !== undefined, data: () => data };
}

/** A getDoc result the test resolves by hand, to order overlapping membership lookups. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  listeners.length = 0;
  unsubscribes.length = 0;
  getDocMock.mockReset();
});

describe("AuthProvider", () => {
  it("starts loading, then reports signedOut when there is no user", async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("state")).toHaveTextContent('"loading"');
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"'));
  });

  it("reports member when user and household docs agree", async () => {
    getDocMock.mockImplementation(async (path: string) => {
      if (path === "users/ava-uid") return snap({ householdId: "home", displayName: "Ava" });
      if (path === "households/home") return snap({ name: "Home", memberIds: ["ava-uid"] });
      return snap(undefined);
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"status":"member"'));
    expect(screen.getByTestId("state")).toHaveTextContent('"householdId":"home"');
  });

  it("reports notMember when the user doc is missing", async () => {
    getDocMock.mockImplementation(async () => snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "stranger-uid", email: "stranger@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
  });

  it("reports notMember when reading the household is denied by rules", async () => {
    getDocMock.mockImplementation(async (path: string) => {
      if (path === "users/x") return snap({ householdId: "home", displayName: "X" });
      throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "x", email: null });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
  });

  it("reports an error when checking membership fails for a reason other than permission", async () => {
    getDocMock.mockImplementation(async () => {
      throw Object.assign(new Error("unavailable"), { code: "unavailable" });
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "y", email: "y@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"status":"error"'));
  });

  it("ignores a slow membership lookup that finishes after the user signed out", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/ava-uid") return slowUserDoc.promise;
      if (path === "households/home") return Promise.resolve(snap({ name: "Home", memberIds: ["ava-uid"] }));
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    expect(screen.getByTestId("state")).toHaveTextContent('"loading"');
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"'));
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Ava" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"signedOut"');
    expect(screen.getByTestId("state")).not.toHaveTextContent('"member"');
  });

  it("never lets an earlier user's lookup overwrite a later user's state", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/slow-uid") return slowUserDoc.promise;
      if (path === "users/fast-uid") return Promise.resolve(snap({ householdId: "home", displayName: "Fast" }));
      if (path === "households/home") return Promise.resolve(snap({ name: "Home", memberIds: ["fast-uid", "slow-uid"] }));
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "slow-uid", email: "slow@safebite.test" });
    listeners[0]({ uid: "fast-uid", email: "fast@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"displayName":"Fast"'));
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Slow" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"displayName":"Fast"');
  });

  it("unsubscribes from auth state changes on unmount", () => {
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
    expect(unsubscribes).toHaveLength(1);
    expect(unsubscribes[0]).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
  });
});
