import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDeletionRequest, discardDeletedNoticeUnlessFor, readDeletionRequest, takeDeletedNotice, writeDeletedNotice, writeDeletionRequest } from "./storage";

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe("account storage", () => {
  it("round-trips a request bound to its uid", () => {
    writeDeletionRequest({ requestId: "id-1", uid: "ava-uid" });
    expect(readDeletionRequest()).toEqual({ requestId: "id-1", uid: "ava-uid" });
    clearDeletionRequest();
    expect(readDeletionRequest()).toBeNull();
  });
  it("a legacy bare id or malformed value has no owner", () => {
    sessionStorage.setItem("safebite.deletionRequest", "R".repeat(43));
    expect(readDeletionRequest()).toEqual({ requestId: "R".repeat(43), uid: null });
    sessionStorage.setItem("safebite.deletionRequest", JSON.stringify({ requestId: "x", uid: "" }));
    expect(readDeletionRequest()).toEqual({ requestId: JSON.stringify({ requestId: "x", uid: "" }), uid: null });
  });
  it("the deleted notice is bound to an account and shown once", () => {
    writeDeletedNotice({ kind: "clearFailed", uid: "ava-uid" });
    expect(takeDeletedNotice()).toEqual({ kind: "clearFailed", uid: "ava-uid" });
    expect(takeDeletedNotice()).toBeNull();
  });
  it("a legacy plain notice value is ignored", () => {
    sessionStorage.setItem("safebite.accountDeleted", "ok");
    expect(takeDeletedNotice()).toBeNull();
  });
  it("discardDeletedNoticeUnlessFor removes a flag for any other account", () => {
    writeDeletedNotice({ kind: "ok", uid: "ava-uid" });
    discardDeletedNoticeUnlessFor("ava-uid");
    expect(sessionStorage.getItem("safebite.accountDeleted")).not.toBeNull();
    discardDeletedNoticeUnlessFor("bogdan-uid");
    expect(takeDeletedNotice()).toBeNull();
  });
  it("ignores an unknown notice value", () => {
    sessionStorage.setItem("safebite.accountDeleted", "weird");
    expect(takeDeletedNotice()).toBeNull();
  });
  it("never throws when storage is blocked (Review Focus 4)", () => {
    for (const m of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, m).mockImplementation(() => { throw new Error("blocked"); });
    }
    expect(() => writeDeletionRequest({ requestId: "x", uid: "u" })).not.toThrow();
    expect(readDeletionRequest()).toBeNull();
    expect(() => clearDeletionRequest()).not.toThrow();
    expect(() => writeDeletedNotice({ kind: "ok", uid: "u" })).not.toThrow();
    expect(takeDeletedNotice()).toBeNull();
  });
});
