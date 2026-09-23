import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetUpdatesForTests, updateAvailable, workerActivated } from "./updates";
import { UpdateBanner } from "./UpdateBanner";

beforeEach(() => resetUpdatesForTests());

describe("UpdateBanner", () => {
  it("renders nothing while idle", () => {
    render(<UpdateBanner />);
    expect(screen.queryByTestId("update-banner")).toBeNull();
  });

  it("shows the new-version message and asks the waiting worker to take over on Reload", async () => {
    const update = vi.fn(async () => {});
    render(<UpdateBanner />);
    act(() => updateAvailable(update));
    const banner = screen.getByTestId("update-banner");
    expect(banner).toHaveAttribute("data-state", "available");
    expect(banner).toHaveTextContent("A new version of SafeBite is ready.");
    await userEvent.click(screen.getByTestId("update-reload"));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("shows the updated-in-another-tab message once the worker activated without this tab asking", () => {
    render(<UpdateBanner />);
    act(() => workerActivated(vi.fn()));
    const banner = screen.getByTestId("update-banner");
    expect(banner).toHaveAttribute("data-state", "activated");
    expect(banner).toHaveTextContent("SafeBite was updated in another tab. Reload when you are ready.");
  });
});
