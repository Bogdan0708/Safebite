import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ deleteMyAccount: vi.fn(), checkDeletion: vi.fn(), finishDeleted: vi.fn() }));
vi.mock("./deleteFlow", () => ({ deleteMyAccount: m.deleteMyAccount, finishDeleted: m.finishDeleted }));
vi.mock("./recovery", async (orig) => ({ ...(await orig<typeof import("./recovery")>()), checkDeletion: m.checkDeletion }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
vi.mock("../firebase", () => ({ auth: { currentUser: { uid: "ava-uid", email: "ava@x" }, authStateReady: async () => {} }, functions: {} }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: vi.fn() }));

import { DeletePasswordForm } from "./DeletePasswordForm";

beforeEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("DeletePasswordForm in-place recovery (real recovery screen)", () => {
  it("an online/offline flip does not restart the receipt check", async () => {
    // Blocked storage: the request id never reaches sessionStorage, so recovery runs in place.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    m.deleteMyAccount.mockResolvedValue({ kind: "lost", requestId: "R" });
    m.checkDeletion.mockResolvedValue({ ok: false });
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" expectedUid="ava-uid" />);
    await userEvent.type(screen.getByTestId("del-password"), "pw");
    await userEvent.click(screen.getByTestId("del-submit"));
    expect(await screen.findByTestId("recovery-uncertain")).toBeInTheDocument();
    expect(m.checkDeletion).toHaveBeenCalledTimes(1);
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
    });
    await act(async () => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByTestId("recovery-uncertain")).toBeInTheDocument();
    expect(m.checkDeletion).toHaveBeenCalledTimes(1);
  });
});
