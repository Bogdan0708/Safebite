import { describe, expect, it, vi } from "vitest";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("./api", () => ({ checkAccountDeletionCall: check }));

import { checkDeletion, classifyCallError, recoveryView } from "./recovery";

const fnErr = (code: string, details?: unknown) => Object.assign(new Error(code), { code: `functions/${code}`, details });

describe("classifyCallError", () => {
  it.each(["deadline-exceeded", "unavailable", "internal", "unknown", "aborted", "data-loss"])("%s is a lost response", (code) => {
    expect(classifyCallError(fnErr(code))).toBe("lost");
  });
  it("an error that is not a functions error is treated as lost (we cannot know it never ran)", () => {
    expect(classifyCallError(new TypeError("Failed to fetch"))).toBe("lost");
  });
  it("recentLogin is recognised by its details reason", () => {
    expect(classifyCallError(fnErr("failed-precondition", { reason: "recentLogin" }))).toBe("recentLogin");
    expect(classifyCallError(fnErr("failed-precondition"))).toBe("failed");
  });
  it("definite refusals", () => {
    expect(classifyCallError(fnErr("permission-denied"))).toBe("permission");
    for (const code of ["invalid-argument", "unauthenticated", "not-found", "resource-exhausted", "already-exists", "out-of-range", "unimplemented"]) {
      expect(classifyCallError(fnErr(code))).toBe("failed");
    }
  });
  it("never reads an Auth error code as anything but lost", () => {
    expect(classifyCallError(Object.assign(new Error(), { code: "auth/user-token-expired" }))).toBe("lost");
  });
});

describe("recoveryView (spec §3.8 Recovery table)", () => {
  it.each([
    [{ ok: true, status: "complete" }, true, "success"], [{ ok: true, status: "complete" }, false, "success"],
    [{ ok: true, status: "started" }, true, "unfinishedSignedIn"], [{ ok: true, status: "dataDeleted" }, true, "unfinishedSignedIn"], [{ ok: true, status: "none" }, true, "unfinishedSignedIn"],
    [{ ok: true, status: "started" }, false, "unfinishedSignedOut"], [{ ok: true, status: "dataDeleted" }, false, "unfinishedSignedOut"], [{ ok: true, status: "none" }, false, "unfinishedSignedOut"],
    [{ ok: false }, true, "uncertain"], [{ ok: false }, false, "uncertain"],
  ] as const)("%j signedIn=%s → %s", (result, signedIn, view) => {
    expect(recoveryView(result, signedIn)).toBe(view);
  });
});

describe("checkDeletion", () => {
  it("wraps the status, and turns any failure into ok: false", async () => {
    check.mockResolvedValueOnce({ status: "complete" });
    await expect(checkDeletion("id")).resolves.toEqual({ ok: true, status: "complete" });
    check.mockRejectedValueOnce(new Error("offline"));
    await expect(checkDeletion("id")).resolves.toEqual({ ok: false });
    check.mockResolvedValueOnce({ status: "bogus" });
    await expect(checkDeletion("id")).resolves.toEqual({ ok: false });
  });
});
