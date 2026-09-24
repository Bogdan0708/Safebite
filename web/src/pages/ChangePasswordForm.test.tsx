import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { changePassword } = vi.hoisted(() => ({ changePassword: vi.fn() }));
vi.mock("../auth/changePassword", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/changePassword")>()),
  changePassword,
}));
vi.mock("../firebase", () => ({ auth: {} }));

import { ChangePasswordForm } from "./ChangePasswordForm";

afterEach(() => vi.clearAllMocks());

async function fill(current: string, next: string, confirm = next) {
  await userEvent.type(screen.getByTestId("pw-current"), current);
  await userEvent.type(screen.getByTestId("pw-new"), next);
  await userEvent.type(screen.getByTestId("pw-confirm"), confirm);
  await userEvent.click(screen.getByTestId("pw-submit"));
}

describe("ChangePasswordForm", () => {
  it("validates on the client before calling Firebase", async () => {
    render(<ChangePasswordForm />);
    await fill("old-password", "short");
    expect(screen.getByTestId("pw-error")).toHaveTextContent("Use at least 8 characters.");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows success only after the change resolves, and clears the fields", async () => {
    let resolve!: (v: string) => void;
    changePassword.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ChangePasswordForm />);
    await fill("old-password", "new-password");
    expect(screen.queryByTestId("pw-success")).toBeNull();
    expect(screen.getByTestId("pw-submit")).toBeDisabled();
    resolve("ok");
    await waitFor(() => expect(screen.getByTestId("pw-success")).toHaveTextContent("Password changed"));
    expect(screen.getByTestId("pw-current")).toHaveValue("");
    expect(screen.getByTestId("pw-new")).toHaveValue("");
  });

  it("a wrong current password clears only that field and keeps the form usable", async () => {
    changePassword.mockResolvedValue("wrongCurrent");
    render(<ChangePasswordForm />);
    await fill("bad-password", "new-password");
    await waitFor(() => expect(screen.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "wrongCurrent"));
    expect(screen.getByTestId("pw-outcome")).toHaveTextContent("That isn't your current password.");
    expect(screen.getByTestId("pw-current")).toHaveValue("");
    expect(screen.getByTestId("pw-new")).toHaveValue("new-password");
    expect(screen.getByTestId("pw-submit")).toBeEnabled();
    expect(screen.queryByTestId("pw-success")).toBeNull();
  });

  it("a policy rejection clears the new-password fields; unknown errors keep every field", async () => {
    changePassword.mockResolvedValueOnce("policy").mockResolvedValueOnce("failed");
    render(<ChangePasswordForm />);
    await fill("old-password", "new-password");
    await waitFor(() => expect(screen.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "policy"));
    expect(screen.getByTestId("pw-current")).toHaveValue("old-password");
    expect(screen.getByTestId("pw-new")).toHaveValue("");
    expect(screen.getByTestId("pw-confirm")).toHaveValue("");
    await userEvent.type(screen.getByTestId("pw-new"), "another-password");
    await userEvent.type(screen.getByTestId("pw-confirm"), "another-password");
    await userEvent.click(screen.getByTestId("pw-submit"));
    await waitFor(() => expect(screen.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "failed"));
    expect(screen.getByTestId("pw-outcome")).toHaveTextContent("Couldn't change your password. Your old password still works.");
    expect(screen.getByTestId("pw-new")).toHaveValue("another-password");
  });
});
