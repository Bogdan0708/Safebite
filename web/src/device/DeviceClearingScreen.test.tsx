import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { clearDeviceData } = vi.hoisted(() => ({ clearDeviceData: vi.fn() }));
vi.mock("./cleanup", () => ({ clearDeviceData }));

import { DeviceClearingScreen } from "./DeviceClearingScreen";

afterEach(() => vi.clearAllMocks());

describe("DeviceClearingScreen", () => {
  it("blocks while clearing, then hands over when nothing failed", async () => {
    clearDeviceData.mockResolvedValue({ failed: [] });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    expect(screen.getByTestId("device-clearing")).toHaveTextContent("Clearing data from this device");
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
  });

  it("on failure shows the message and Try again, and nothing else", async () => {
    clearDeviceData.mockResolvedValueOnce({ failed: ["offline-store"] }).mockResolvedValueOnce({ failed: [] });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    expect(await screen.findByTestId("device-clear-failed")).toHaveTextContent("Some data on this device couldn't be cleared.");
    expect(onCleared).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("device-clear-retry"));
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
  });
});
