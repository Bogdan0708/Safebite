import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ deleteMyAccount: vi.fn(), resetDocument: vi.fn(), readDeletionRequest: vi.fn() }));
vi.mock("./deleteFlow", () => ({ deleteMyAccount: m.deleteMyAccount }));
vi.mock("../auth/resetDocument", () => ({ resetDocument: m.resetDocument }));
vi.mock("./storage", () => ({ readDeletionRequest: m.readDeletionRequest }));
vi.mock("./DeletionRecoveryScreen", () => ({
  DeletionRecoveryScreen: ({ requestId, onDismiss }: { requestId: string; onDismiss: () => void }) => (
    <button type="button" data-testid="stub-recovery" data-request={requestId} onClick={onDismiss}>recovery</button>
  ),
}));

import { DeletePasswordForm } from "./DeletePasswordForm";

beforeEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));
afterEach(() => vi.clearAllMocks());

const submit = async (pw = "pilot-password-1") => {
  await userEvent.type(screen.getByTestId("del-password"), pw);
  await userEvent.click(screen.getByTestId("del-submit"));
};

describe("DeletePasswordForm", () => {
  it("asks for the password before doing anything", async () => {
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await userEvent.click(screen.getByTestId("del-submit"));
    expect(screen.getByTestId("delete-outcome")).toHaveTextContent("Enter your password.");
    expect(m.deleteMyAccount).not.toHaveBeenCalled();
  });

  it("shows the non-dismissable progress screen while deleting", async () => {
    m.deleteMyAccount.mockReturnValue(new Promise(() => {}));
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await submit();
    expect(screen.getByTestId("delete-progress")).toHaveTextContent("Deleting your account… keep this page open");
    expect(screen.queryByTestId("del-submit")).toBeNull();
  });

  it.each([
    [{ kind: "reauth", result: "wrongCurrent" }, "That isn't your current password."],
    [{ kind: "reauth", result: "tooManyRequests" }, "Too many attempts. Wait a few minutes and try again."],
    [{ kind: "reauth", result: "offline" }, "You are offline. Connect and try again."],
    [{ kind: "recentLogin" }, "For security, enter your password again."],
    [{ kind: "permission" }, "This account can't be deleted here."],
    [{ kind: "failed" }, "Couldn't delete your account. Try again."],
  ])("outcome %j shows its message and keeps the form", async (outcome, text) => {
    m.deleteMyAccount.mockResolvedValue(outcome);
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await submit();
    await waitFor(() => expect(screen.getByTestId("delete-outcome")).toHaveTextContent(text));
    expect(screen.getByTestId("del-submit")).toBeEnabled();
    expect(m.resetDocument).not.toHaveBeenCalled();
  });

  it("a lost response reloads the tab so the recovery screen takes over", async () => {
    m.deleteMyAccount.mockResolvedValue({ kind: "lost", requestId: "R" });
    m.readDeletionRequest.mockReturnValue("R");
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await submit();
    await waitFor(() => expect(m.resetDocument).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("stub-recovery")).toBeNull();
  });

  it.each([[null], ["OTHER"]])("a lost response whose request id was not stored (%s) shows recovery in place, without a reload (final review F5)", async (stored) => {
    m.deleteMyAccount.mockResolvedValue({ kind: "lost", requestId: "R" });
    m.readDeletionRequest.mockReturnValue(stored);
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    await submit();
    await waitFor(() => expect(screen.getByTestId("stub-recovery")).toHaveAttribute("data-request", "R"));
    expect(m.resetDocument).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("stub-recovery"));
    expect(m.resetDocument).toHaveBeenCalledTimes(1);
  });

  it("is disabled while offline (Review Focus 5)", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<DeletePasswordForm submitLabel="Delete my account" testid="del" />);
    expect(screen.getByTestId("del-submit")).toBeDisabled();
    expect(screen.getByTestId("delete-offline")).toHaveTextContent("You are offline");
  });
});
