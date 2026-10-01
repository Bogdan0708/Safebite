import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  reauthenticateWithCredential: vi.fn(),
  credential: vi.fn((email: string, password: string) => ({ email, password })),
  currentUser: { email: "ava@safebite.test" } as { email: string | null } | null,
}));
vi.mock("../firebase", () => ({ get auth() { return { currentUser: f.currentUser }; } }));
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: f.credential },
  reauthenticateWithCredential: f.reauthenticateWithCredential,
}));

import { reauthenticate } from "./reauthenticate";

const err = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  f.currentUser = { email: "ava@safebite.test" };
  f.reauthenticateWithCredential.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("reauthenticate", () => {
  it("reauthenticates the current user with their email and the given password", async () => {
    await expect(reauthenticate("pw")).resolves.toBe("ok");
    expect(f.credential).toHaveBeenCalledWith("ava@safebite.test", "pw");
  });
  it("is offline without a request when the browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(reauthenticate("pw")).resolves.toBe("offline");
    expect(f.reauthenticateWithCredential).not.toHaveBeenCalled();
  });
  it("fails without a signed-in user with an email", async () => {
    f.currentUser = null;
    await expect(reauthenticate("pw")).resolves.toBe("failed");
  });
  it.each([
    ["auth/invalid-credential", "wrongCurrent"], ["auth/wrong-password", "wrongCurrent"],
    ["auth/too-many-requests", "tooManyRequests"], ["auth/network-request-failed", "offline"], ["auth/other", "failed"],
  ])("maps %s to %s", async (code, result) => {
    f.reauthenticateWithCredential.mockRejectedValue(err(code));
    await expect(reauthenticate("pw")).resolves.toBe(result);
  });
});
