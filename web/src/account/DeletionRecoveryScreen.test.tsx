import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  checkDeletion: vi.fn(),
  finishDeleted: vi.fn(),
  signOut: vi.fn(),
  currentUser: null as unknown,
}));
vi.mock("./recovery", async (orig) => ({ ...(await orig<typeof import("./recovery")>()), checkDeletion: m.checkDeletion }));
vi.mock("./deleteFlow", () => ({ finishDeleted: m.finishDeleted, deleteMyAccount: vi.fn() }));
vi.mock("firebase/auth", () => ({ signOut: m.signOut }));
vi.mock("../firebase", () => ({ get auth() { return { currentUser: m.currentUser, authStateReady: async () => {} }; }, functions: {} }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: vi.fn() }));

import { DeletionRecoveryScreen } from "./DeletionRecoveryScreen";
import { readDeletionRequest, writeDeletionRequest } from "./storage";

afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); m.currentUser = null; });

describe("DeletionRecoveryScreen", () => {
  it("complete: finishes deleting (device clear, notice, sign out)", async () => {
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen requestId="R" onDismiss={vi.fn()} />);
    expect(screen.getByTestId("recovery-checking")).toBeInTheDocument();
    await waitFor(() => expect(m.finishDeleted).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("recovery-success")).toHaveTextContent("Your account has been deleted.");
  });

  it("unfinished and signed in: offers Finish deleting with a password", async () => {
    m.currentUser = { uid: "u" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    render(<DeletionRecoveryScreen requestId="R" onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-unfinished")).toHaveTextContent("Your account deletion didn't finish.");
    expect(screen.getByTestId("finish-submit")).toHaveTextContent("Finish deleting");
  });

  it("unfinished and signed in: shows the account and Sign out clears the key", async () => {
    writeDeletionRequest("R");
    m.currentUser = { uid: "u", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen requestId="R" onDismiss={onDismiss} />);
    expect(await screen.findByTestId("recovery-account")).toHaveTextContent("Signed in as ava@x");
    await userEvent.click(screen.getByTestId("recovery-signout"));
    expect(readDeletionRequest()).toBeNull();
    expect(m.signOut).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("unfinished and signed out: Sign in clears the key and dismisses", async () => {
    writeDeletionRequest("R");
    m.checkDeletion.mockResolvedValue({ ok: true, status: "dataDeleted" });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen requestId="R" onDismiss={onDismiss} />);
    await userEvent.click(await screen.findByTestId("recovery-signin"));
    expect(readDeletionRequest()).toBeNull();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("uncertain: Check again repeats only the check, without a password", async () => {
    m.checkDeletion.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen requestId="R" onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-uncertain")).toHaveTextContent("We couldn't confirm whether your account was deleted.");
    expect(screen.queryByTestId("finish-password")).toBeNull();
    await userEvent.click(screen.getByTestId("recovery-check-again"));
    await waitFor(() => expect(m.finishDeleted).toHaveBeenCalledTimes(1));
    expect(m.checkDeletion).toHaveBeenCalledTimes(2);
  });

  it("uncertain: Sign out clears the key", async () => {
    writeDeletionRequest("R");
    m.currentUser = { uid: "u" };
    m.checkDeletion.mockResolvedValue({ ok: false });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen requestId="R" onDismiss={onDismiss} />);
    await userEvent.click(await screen.findByTestId("recovery-signout"));
    expect(readDeletionRequest()).toBeNull();
    expect(m.signOut).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});
