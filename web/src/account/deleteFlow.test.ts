import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  reauthenticate: vi.fn(),
  deleteAccountCall: vi.fn(),
  clearDeviceData: vi.fn(),
  signOut: vi.fn(),
  resetDocument: vi.fn(),
  getIdToken: vi.fn(),
  order: [] as string[],
}));
vi.mock("../auth/reauthenticate", () => ({ reauthenticate: m.reauthenticate }));
vi.mock("./api", () => ({ deleteAccountCall: m.deleteAccountCall, newRequestId: () => "R".repeat(43) }));
vi.mock("../device/cleanup", () => ({ clearDeviceData: m.clearDeviceData }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: m.resetDocument }));
vi.mock("firebase/auth", () => ({ signOut: m.signOut }));
vi.mock("../firebase", () => ({ get auth() { return { currentUser: { getIdToken: m.getIdToken } }; } }));

import { deleteMyAccount } from "./deleteFlow";
import { readDeletionRequest, takeDeletedNotice } from "./storage";

const fnErr = (code: string, details?: unknown) => Object.assign(new Error(code), { code: `functions/${code}`, details });

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  m.order.length = 0;
  m.reauthenticate.mockImplementation(async () => { m.order.push("reauth"); return "ok"; });
  m.getIdToken.mockImplementation(async () => { m.order.push("token"); return "t"; });
  m.deleteAccountCall.mockImplementation(async () => { m.order.push("call"); return { deleted: true, lastMember: false }; });
  m.clearDeviceData.mockImplementation(async () => { m.order.push("clear"); return { failed: [] }; });
  m.signOut.mockImplementation(async () => { m.order.push("signOut"); });
  m.resetDocument.mockImplementation(() => { m.order.push("reset"); });
});
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

describe("deleteMyAccount", () => {
  it("offline: nothing is sent, not even reauthentication (Review Focus 5)", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "reauth", result: "offline" });
    expect(m.reauthenticate).not.toHaveBeenCalled();
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("a wrong password sends nothing", async () => {
    m.reauthenticate.mockResolvedValue("wrongCurrent");
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "reauth", result: "wrongCurrent" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
    expect(readDeletionRequest()).toBeNull();
  });

  it("success: reauth → fresh token → call → clear device → sign out → reset; the token is never refreshed after the call", async () => {
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "deleted" });
    expect(m.order).toEqual(["reauth", "token", "call", "clear", "signOut", "reset"]);
    expect(m.getIdToken).toHaveBeenCalledWith(true);
    expect(m.deleteAccountCall).toHaveBeenCalledWith({ requestId: "R".repeat(43) });
    expect(takeDeletedNotice()).toBe("ok");
    expect(readDeletionRequest()).toBeNull();
  });

  it("the request id is stored before the call is sent", async () => {
    m.deleteAccountCall.mockImplementation(async () => { expect(readDeletionRequest()).toBe("R".repeat(43)); return { deleted: true, lastMember: false }; });
    await deleteMyAccount("pw");
  });

  it("success with failed device clearing is reported separately", async () => {
    m.clearDeviceData.mockResolvedValue({ failed: ["store"] });
    await deleteMyAccount("pw");
    expect(takeDeletedNotice()).toBe("clearFailed");
  });

  it("a lost response keeps the request id for recovery and does not sign out", async () => {
    m.deleteAccountCall.mockRejectedValue(fnErr("deadline-exceeded"));
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "lost", requestId: "R".repeat(43) });
    expect(readDeletionRequest()).toBe("R".repeat(43));
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.getIdToken).toHaveBeenCalledTimes(1);
  });

  it.each([
    [fnErr("failed-precondition", { reason: "recentLogin" }), "recentLogin"],
    [fnErr("permission-denied"), "permission"],
    [fnErr("invalid-argument"), "failed"],
  ] as const)("a definite refusal clears the request id: %s", async (error, kind) => {
    m.deleteAccountCall.mockRejectedValue(error);
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind });
    expect(readDeletionRequest()).toBeNull();
  });

  it("a token refresh failing before the call sends nothing", async () => {
    m.getIdToken.mockRejectedValue(new Error("network"));
    await expect(deleteMyAccount("pw")).resolves.toEqual({ kind: "failed" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });
});
