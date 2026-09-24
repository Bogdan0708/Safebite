import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
  credential: vi.fn((email: string, password: string) => ({ email, password })),
  currentUser: { email: "ava@safebite.test" } as { email: string | null } | null,
}));
vi.mock("../firebase", () => ({
  get auth() {
    return { currentUser: f.currentUser };
  },
}));
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: f.credential },
  reauthenticateWithCredential: f.reauthenticateWithCredential,
  updatePassword: f.updatePassword,
}));

import { CHANGE_PASSWORD_MESSAGES, changePassword, validateNewPassword } from "./changePassword";

const err = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  f.currentUser = { email: "ava@safebite.test" };
  f.reauthenticateWithCredential.mockResolvedValue({});
  f.updatePassword.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("validateNewPassword", () => {
  it("needs at least 8 characters and a matching confirmation", () => {
    expect(validateNewPassword("short", "short")).toBe("Use at least 8 characters.");
    expect(validateNewPassword("long-enough", "long-enougH")).toBe("The two new passwords don't match.");
    expect(validateNewPassword("long-enough", "long-enough")).toBeNull();
  });
});

describe("changePassword", () => {
  it("reauthenticates with the current password, then updates", async () => {
    expect(await changePassword("old-password", "new-password")).toBe("ok");
    expect(f.credential).toHaveBeenCalledWith("ava@safebite.test", "old-password");
    expect(f.updatePassword).toHaveBeenCalledWith({ email: "ava@safebite.test" }, "new-password");
  });

  it.each([
    ["auth/invalid-credential", "wrongCurrent"],
    ["auth/wrong-password", "wrongCurrent"],
    ["auth/too-many-requests", "tooManyRequests"],
    ["auth/network-request-failed", "offline"],
    ["auth/internal-error", "failed"],
  ])("a failed reauthentication (%s) is %s and never attempts the update", async (code, result) => {
    f.reauthenticateWithCredential.mockRejectedValue(err(code));
    expect(await changePassword("old-password", "new-password")).toBe(result);
    expect(f.updatePassword).not.toHaveBeenCalled();
  });

  it.each([
    ["auth/weak-password", "policy"],
    ["auth/password-does-not-meet-requirements", "policy"],
    ["auth/requires-recent-login", "recentLogin"],
  ])("a definitive update rejection (%s) is %s", async (code, result) => {
    f.updatePassword.mockRejectedValue(err(code));
    expect(await changePassword("old-password", "new-password")).toBe(result);
  });

  // The SDK looks the account up after the update request succeeds, so any other failure in this
  // phase cannot prove the password is unchanged (audit F3).
  it.each(["auth/network-request-failed", "auth/too-many-requests", "auth/internal-error", "something/unexpected"])(
    "any other update-phase failure (%s) is uncertain",
    async (code) => {
      f.updatePassword.mockRejectedValue(err(code));
      expect(await changePassword("old-password", "new-password")).toBe("uncertain");
    },
  );

  it("is offline without calling Firebase when the browser is offline, and failed without a signed-in email", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await changePassword("a", "b")).toBe("offline");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    f.currentUser = null;
    expect(await changePassword("a", "b")).toBe("failed");
    expect(f.reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it("has a message for every failure", () => {
    expect(CHANGE_PASSWORD_MESSAGES).toEqual({
      wrongCurrent: "That isn't your current password.",
      tooManyRequests: "Too many attempts. Wait a few minutes and try again.",
      offline: "You are offline. Connect and try again.",
      policy: "Your new password doesn't meet this account's password rules. Choose a different one.",
      recentLogin: "For security, sign out and back in, then try again.",
      failed: "Couldn't change your password. Your old password still works.",
      uncertain: "We couldn't confirm whether your password changed. Sign out, then sign in with your new password; if that doesn't work, use your old one.",
    });
  });
});
