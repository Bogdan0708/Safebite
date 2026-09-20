import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listeners, getDocMock } = vi.hoisted(() => ({
  listeners: [] as Array<(user: unknown) => void>,
  getDocMock: vi.fn(),
}));

vi.mock("../firebase", () => ({ auth: {}, db: {}, functions: {}, usingEmulators: true }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    listeners.push(cb);
    return () => {};
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

beforeEach(() => {
  listeners.length = 0;
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
});
