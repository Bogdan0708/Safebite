import { describe, expect, it, vi } from "vitest";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("./api", () => ({ checkAccountDeletionCall: check }));

import { checkDeletion, classifyCallError, recoveryView } from "./recovery";
import type { ReceiptStatus } from "./api";

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

  it("an accountChanged refusal is recognised by its details reason", () => {
    expect(classifyCallError(fnErr("permission-denied", { reason: "accountChanged" }))).toBe("accountChanged");
    expect(classifyCallError(fnErr("permission-denied"))).toBe("permission");
  });
});

describe("recoveryView (spec §3.8 Recovery table, amended after the implementation audit)", () => {
  const ok = (status: ReceiptStatus) => ({ ok: true, status }) as const;
  it.each([
    [{ ok: false }, "ava", "ava", "uncertain"],
    [{ ok: false }, "ava", null, "uncertain"],
    [ok("complete"), "ava", null, "success"],
    [ok("complete"), "ava", "ava", "success"],
    [ok("complete"), "ava", "bogdan", "otherAccount"],
    [ok("started"), "ava", "bogdan", "otherAccount"],
    [ok("none"), "ava", "bogdan", "otherAccount"],
    [ok("none"), "ava", "ava", "confirmationUnavailable"],
    [ok("none"), "ava", null, "confirmationUnavailable"],
    [ok("started"), "ava", "ava", "unfinishedSignedIn"],
    [ok("dataDeleted"), "ava", "ava", "unfinishedSignedIn"],
    [ok("started"), "ava", null, "unfinishedSignedOut"],
    [ok("dataDeleted"), "ava", null, "unfinishedSignedOut"],
    // A request with no owner (legacy) never shows a delete form.
    [ok("started"), null, "ava", "confirmationUnavailable"],
    [ok("started"), null, null, "confirmationUnavailable"],
    [ok("complete"), null, "ava", "confirmationUnavailable"],
    [ok("complete"), null, null, "success"],
  ] as const)("%j request=%s current=%s → %s", (check, requestUid, currentUid, view) => {
    expect(recoveryView(check, requestUid, currentUid)).toBe(view);
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
