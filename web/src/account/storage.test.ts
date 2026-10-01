import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDeletionRequest, readDeletionRequest, takeDeletedNotice, writeDeletedNotice, writeDeletionRequest } from "./storage";

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

describe("account storage", () => {
  it("round-trips the deletion request id", () => {
    writeDeletionRequest("id-1");
    expect(readDeletionRequest()).toBe("id-1");
    clearDeletionRequest();
    expect(readDeletionRequest()).toBeNull();
  });
  it("the deleted notice is shown once", () => {
    writeDeletedNotice("clearFailed");
    expect(takeDeletedNotice()).toBe("clearFailed");
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
    expect(() => writeDeletionRequest("x")).not.toThrow();
    expect(readDeletionRequest()).toBeNull();
    expect(() => clearDeletionRequest()).not.toThrow();
    expect(() => writeDeletedNotice("ok")).not.toThrow();
    expect(takeDeletedNotice()).toBeNull();
  });
});
