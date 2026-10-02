import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  reauthenticate: vi.fn(),
  deleteAccountCall: vi.fn(),
  clearDeviceData: vi.fn(),
  signOut: vi.fn(),
  resetDocument: vi.fn(),
  removePersisted: vi.fn(async (uid: string) => { m.order.push(`remove:${uid}`); return "removed"; }),
  recordDeletedUid: vi.fn((uid: string) => { m.order.push(`record:${uid}`); }),
  getIdToken: vi.fn(),
  order: [] as string[],
  current: null as unknown,
}));
vi.mock("../auth/reauthenticate", () => ({ reauthenticate: m.reauthenticate }));
vi.mock("./api", () => ({ deleteAccountCall: m.deleteAccountCall, newRequestId: () => "R".repeat(43) }));
vi.mock("../device/cleanup", () => ({ clearDeviceData: m.clearDeviceData }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: m.resetDocument }));
vi.mock("./deletedSessions", () => ({ recordDeletedUid: m.recordDeletedUid }));
vi.mock("./persistedSession", () => ({ removePersistedUserIfUid: m.removePersisted }));
vi.mock("firebase/auth", () => ({ signOut: m.signOut }));
vi.mock("../firebase", () => ({ get auth() { return { currentUser: m.current }; } }));

import { deleteMyAccount, finishDeleted } from "./deleteFlow";
import { readDeletionRequest, takeDeletedNotice } from "./storage";

const fnErr = (code: string, details?: unknown) => Object.assign(new Error(code), { code: `functions/${code}`, details });

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  m.order.length = 0;
  m.current = { uid: "ava-uid", getIdToken: m.getIdToken };
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
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "reauth", result: "offline" });
    expect(m.reauthenticate).not.toHaveBeenCalled();
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("a wrong password sends nothing", async () => {
    m.reauthenticate.mockResolvedValue("wrongCurrent");
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "reauth", result: "wrongCurrent" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
    expect(readDeletionRequest()).toBeNull();
  });

  it("success: reauth → fresh token → call → clear device → remove persisted user → record → reset, never signOut; the token is never refreshed after the call", async () => {
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "deleted" });
    expect(m.order).toEqual(["reauth", "token", "call", "clear", "remove:ava-uid", "record:ava-uid", "reset"]);
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.getIdToken).toHaveBeenCalledWith(true);
    expect(m.reauthenticate).toHaveBeenCalledWith("pw", m.current);
    expect(m.deleteAccountCall).toHaveBeenCalledWith({ requestId: "R".repeat(43), expectedUid: "ava-uid" });
    expect(takeDeletedNotice()).toEqual({ kind: "ok", uid: "ava-uid" });
    expect(readDeletionRequest()).toBeNull();
  });

  it("the request id is stored before the call is sent", async () => {
    let seen: unknown = null;
    m.deleteAccountCall.mockImplementation(async () => { seen = readDeletionRequest(); return { deleted: true, lastMember: false }; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "deleted" });
    expect(seen).toEqual({ requestId: "R".repeat(43), uid: "ava-uid" });
  });

  it("the notice is written, the request cleared and the uid recorded before the reset", async () => {
    let atReset: { notice: string | null; request: unknown; recorded: unknown[][] } | null = null;
    m.resetDocument.mockImplementation(() => {
      atReset = { notice: sessionStorage.getItem("safebite.accountDeleted"), request: readDeletionRequest(), recorded: [...m.recordDeletedUid.mock.calls] };
    });
    await deleteMyAccount("pw", "ava-uid");
    expect(atReset!.request).toBeNull();
    expect(JSON.parse(atReset!.notice!)).toEqual({ kind: "ok", uid: "ava-uid" });
    expect(atReset!.recorded).toEqual([["ava-uid"]]);
  });

  it("success with failed device clearing is reported separately", async () => {
    m.clearDeviceData.mockResolvedValue({ failed: ["store"] });
    await deleteMyAccount("pw", "ava-uid");
    expect(takeDeletedNotice()).toEqual({ kind: "clearFailed", uid: "ava-uid" });
  });

  it("a lost response keeps the request id for recovery and does not sign out", async () => {
    m.deleteAccountCall.mockRejectedValue(fnErr("deadline-exceeded"));
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "lost", requestId: "R".repeat(43) });
    expect(readDeletionRequest()).toEqual({ requestId: "R".repeat(43), uid: "ava-uid" });
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.getIdToken).toHaveBeenCalledTimes(1);
  });

  it.each([
    [fnErr("failed-precondition", { reason: "recentLogin" }), "recentLogin"],
    [fnErr("permission-denied"), "permission"],
    [fnErr("permission-denied", { reason: "accountChanged" }), "accountChanged"],
    [fnErr("invalid-argument"), "failed"],
  ] as const)("a definite refusal clears the request id: %s", async (error, kind) => {
    m.deleteAccountCall.mockRejectedValue(error);
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind });
    expect(readDeletionRequest()).toBeNull();
  });

  it("a token refresh failing before the call sends nothing", async () => {
    m.getIdToken.mockRejectedValue(new Error("network"));
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "failed" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("refuses when the current account is not the expected one, sending nothing", async () => {
    await expect(deleteMyAccount("pw", "bogdan-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.reauthenticate).not.toHaveBeenCalled();
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("refuses when the account changes during reauthentication (another tab signed in)", async () => {
    m.reauthenticate.mockImplementation(async () => { m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return "ok"; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.getIdToken).not.toHaveBeenCalled();
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
    expect(readDeletionRequest()).toBeNull();
  });

  it("refuses when the account changes during the token refresh", async () => {
    m.getIdToken.mockImplementation(async () => { m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return "t"; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
    expect(readDeletionRequest()).toBeNull();
  });

  it("the same uid in a different user object (re-sign-in) is also a change", async () => {
    m.reauthenticate.mockImplementation(async () => { m.current = { uid: "ava-uid", getIdToken: m.getIdToken }; return "ok"; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(m.deleteAccountCall).not.toHaveBeenCalled();
  });

  it("another account becomes current during the callable: deleted, but that account is untouched (auditor re-review)", async () => {
    m.deleteAccountCall.mockImplementation(async () => { m.order.push("call"); m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return { deleted: true, lastMember: false }; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "deletedOtherAccount" });
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.clearDeviceData).not.toHaveBeenCalled();
    expect(m.resetDocument).not.toHaveBeenCalled();
    expect(m.recordDeletedUid).not.toHaveBeenCalled();
    expect(takeDeletedNotice()).toBeNull();
    expect(readDeletionRequest()).toBeNull();
  });

  it("another account becomes current during device cleanup: no sign-out, no notice", async () => {
    m.clearDeviceData.mockImplementation(async () => { m.current = { uid: "bogdan-uid", getIdToken: m.getIdToken }; return { failed: [] }; });
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "deletedOtherAccount" });
    expect(m.clearDeviceData).toHaveBeenCalled();
    expect(m.signOut).not.toHaveBeenCalled();
    expect(m.recordDeletedUid).not.toHaveBeenCalled();
    expect(takeDeletedNotice()).toBeNull();
  });

  it("finishDeleted(null) acts only when nobody is signed in", async () => {
    await expect(finishDeleted(null)).resolves.toBe("otherAccount");
    expect(m.signOut).not.toHaveBeenCalled();
    m.current = null;
    await expect(finishDeleted(null)).resolves.toBe("finished");
    expect(m.resetDocument).toHaveBeenCalled();
    expect(m.recordDeletedUid).not.toHaveBeenCalled();
    expect(takeDeletedNotice()).toEqual({ kind: "ok", uid: null });
  });

  it("the persisted user is not removed when another account is current or requestUid is null", async () => {
    await finishDeleted(null).catch(() => {});
    expect(m.removePersisted).not.toHaveBeenCalled();
    m.current = null;
    await finishDeleted(null);
    expect(m.removePersisted).not.toHaveBeenCalled();
  });

  it("finishDeleted never calls signOut (final review P2)", async () => {
    await finishDeleted("ava-uid");
    m.current = null;
    await finishDeleted(null);
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("a server accountChanged refusal clears the request", async () => {
    m.deleteAccountCall.mockRejectedValue(fnErr("permission-denied", { reason: "accountChanged" }));
    await expect(deleteMyAccount("pw", "ava-uid")).resolves.toEqual({ kind: "accountChanged" });
    expect(readDeletionRequest()).toBeNull();
  });
});
