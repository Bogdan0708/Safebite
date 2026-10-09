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
    m.finishDeleted.mockResolvedValue("finished");
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("recovery-checking")).toBeInTheDocument();
    await waitFor(() => expect(m.finishDeleted).toHaveBeenCalledWith("ava-uid"));
    expect(await screen.findByTestId("recovery-success")).toHaveTextContent("Your account has been deleted.");
  });

  it("complete: shows a neutral Finishing state, not the success message, until finishDeleted resolves", async () => {
    let finish!: (v: "finished") => void;
    m.finishDeleted.mockReturnValue(new Promise((r) => { finish = r; }));
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-finishing")).toBeInTheDocument();
    expect(screen.queryByTestId("recovery-success")).toBeNull();
    finish("finished");
    expect(await screen.findByTestId("recovery-success")).toBeInTheDocument();
    expect(screen.queryByTestId("recovery-finishing")).toBeNull();
  });

  it("complete, finishDeleted resolves otherAccount: recovery-success is never rendered", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    m.finishDeleted.mockResolvedValue("otherAccount");
    const seen: boolean[] = [];
    const observer = new MutationObserver(() => seen.push(document.querySelector('[data-testid="recovery-success"]') !== null));
    observer.observe(document.body, { childList: true, subtree: true });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-other-account")).toBeInTheDocument();
    observer.disconnect();
    expect(seen).not.toContain(true);
    expect(screen.queryByTestId("recovery-success")).toBeNull();
  });

  it("unfinished and signed in: offers Finish deleting with a password", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-unfinished")).toHaveTextContent("Your account deletion didn't finish.");
    expect(screen.getByTestId("finish-submit")).toHaveTextContent("Finish deleting");
  });

  it("unfinished and signed in: shows the account and Sign out clears the key", async () => {
    writeDeletionRequest({ requestId: "R", uid: "ava-uid" });
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={onDismiss} />);
    expect(await screen.findByTestId("recovery-account")).toHaveTextContent("Signed in as ava@x");
    await userEvent.click(screen.getByTestId("recovery-signout"));
    expect(readDeletionRequest()).toBeNull();
    expect(m.signOut).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("unfinished and signed out: Sign in clears the key and dismisses", async () => {
    writeDeletionRequest({ requestId: "R", uid: "ava-uid" });
    m.checkDeletion.mockResolvedValue({ ok: true, status: "dataDeleted" });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={onDismiss} />);
    expect(await screen.findByTestId("recovery-unfinished")).toHaveTextContent("Sign in to that account to finish it.");
    await userEvent.click(await screen.findByTestId("recovery-signin"));
    expect(readDeletionRequest()).toBeNull();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("uncertain: Check again repeats only the check, without a password", async () => {
    m.finishDeleted.mockResolvedValue("finished");
    m.checkDeletion.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-uncertain")).toHaveTextContent("We couldn't confirm whether your account was deleted.");
    expect(screen.getByTestId("recovery-uncertain")).not.toHaveTextContent("offered to finish");
    expect(screen.queryByTestId("finish-password")).toBeNull();
    await userEvent.click(screen.getByTestId("recovery-check-again"));
    await waitFor(() => expect(m.finishDeleted).toHaveBeenCalledTimes(1));
    expect(m.checkDeletion).toHaveBeenCalledTimes(2);
  });

  it("uncertain: Sign out clears the key", async () => {
    writeDeletionRequest({ requestId: "R", uid: "ava-uid" });
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: false });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={onDismiss} />);
    await userEvent.click(await screen.findByTestId("recovery-signout"));
    expect(readDeletionRequest()).toBeNull();
    expect(m.signOut).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("another account signed in: no delete form; Continue clears the key and dismisses (implementation audit P1-1)", async () => {
    writeDeletionRequest({ requestId: "R", uid: "ava-uid" });
    m.currentUser = { uid: "bogdan-uid", email: "bogdan@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    const onDismiss = vi.fn();
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={onDismiss} />);
    expect(await screen.findByTestId("recovery-other-account")).toHaveTextContent("This deletion request belongs to another account. Nothing will be deleted from this one.");
    expect(screen.queryByTestId("finish-password")).toBeNull();
    expect(m.finishDeleted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("recovery-continue"));
    expect(readDeletionRequest()).toBeNull();
    expect(onDismiss).toHaveBeenCalled();
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("a complete receipt with another account signed in neither signs them out nor says deleted", async () => {
    m.currentUser = { uid: "bogdan-uid", email: "bogdan@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-other-account")).toBeInTheDocument();
    expect(m.finishDeleted).not.toHaveBeenCalled();
    expect(screen.queryByTestId("recovery-success")).toBeNull();
  });

  it("none: confirmation unavailable — never 'didn't finish', no delete form (implementation audit P2-3)", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "none" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    const view = await screen.findByTestId("recovery-unavailable");
    expect(view).toHaveTextContent("We can't confirm what happened to this deletion request. The confirmation may have expired.");
    expect(view).not.toHaveTextContent("didn't finish");
    expect(screen.queryByTestId("finish-password")).toBeNull();
  });

  it("complete, then another account becomes current during cleanup: Other account with the confirmed line, no sign-out (auditor re-review)", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "complete" });
    m.finishDeleted.mockResolvedValue("otherAccount");
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: "ava-uid" }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-other-account")).toBeInTheDocument();
    expect(screen.getByTestId("recovery-confirmed")).toHaveTextContent("That account's deletion is confirmed.");
    expect(m.finishDeleted).toHaveBeenCalledWith("ava-uid");
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("a request with no owner never shows a delete form", async () => {
    m.currentUser = { uid: "ava-uid", email: "ava@x" };
    m.checkDeletion.mockResolvedValue({ ok: true, status: "started" });
    render(<DeletionRecoveryScreen request={{ requestId: "R", uid: null }} onDismiss={vi.fn()} />);
    expect(await screen.findByTestId("recovery-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("finish-password")).toBeNull();
  });
});
