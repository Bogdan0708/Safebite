import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { whoamiCalls } = vi.hoisted(() => ({ whoamiCalls: vi.fn() }));
vi.mock("../firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: () => async (data: unknown) => {
    whoamiCalls(data);
    return { data: { uid: "ava-uid", householdId: "home", displayName: "Ava" } };
  },
}));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: vi.fn() }),
}));
vi.mock("./ChangePasswordForm", () => ({ ChangePasswordForm: () => <div data-testid="pw-form" /> }));

import { SettingsPage } from "./SettingsPage";

beforeEach(() => whoamiCalls.mockClear());

describe("SettingsPage", () => {
  it("issues exactly one whoami request even when StrictMode double-runs the effect", async () => {
    render(<StrictMode><SettingsPage /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("whoami")).toHaveTextContent("Ava"));
    expect(whoamiCalls).toHaveBeenCalledTimes(1);
  });

  it("shows the server's household confirmation", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId("whoami")).toHaveTextContent('household “home”'));
  });

  it("offers the change-password form", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("pw-form")).toBeInTheDocument();
  });
});
