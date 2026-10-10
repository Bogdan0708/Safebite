import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clearDeviceData } = vi.hoisted(() => ({ clearDeviceData: vi.fn() }));
vi.mock("./cleanup", async (importOriginal) => ({ ...(await importOriginal<typeof import("./cleanup")>()), clearDeviceData }));

import { DeviceClearingScreen } from "./DeviceClearingScreen";

beforeEach(() => localStorage.clear());
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

describe("captured key retirement (review R2-3)", () => {
  it("retires only the keys present when it started, then clears again for a key written meanwhile", async () => {
    localStorage.setItem("safebite.pendingClear.first", "1");
    let round = 0;
    clearDeviceData.mockImplementation(async () => {
      round += 1;
      if (round === 1) localStorage.setItem("safebite.pendingClear.second", "1"); // another tab starts clearing
      return { failed: [] };
    });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(round).toBe(2);
    expect(localStorage.getItem("safebite.pendingClear.first")).toBeNull();
    expect(localStorage.getItem("safebite.pendingClear.second")).toBeNull();
  });

  it("a key that keeps reappearing ends on the failure screen, not an endless loop", async () => {
    clearDeviceData.mockImplementation(async () => {
      localStorage.setItem(`safebite.pendingClear.${Math.random()}`, "1");
      return { failed: [] };
    });
    const onCleared = vi.fn();
    render(<DeviceClearingScreen onCleared={onCleared} />);
    expect(await screen.findByTestId("device-clear-failed")).toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
    expect(clearDeviceData).toHaveBeenCalledTimes(3);
  });

  it("a failed run leaves every key in place", async () => {
    localStorage.setItem("safebite.pendingClear.first", "1");
    clearDeviceData.mockResolvedValue({ failed: ["offlineCopy"] });
    render(<DeviceClearingScreen onCleared={vi.fn()} />);
    expect(await screen.findByTestId("device-clear-failed")).toBeInTheDocument();
    expect(localStorage.getItem("safebite.pendingClear.first")).toBe("1");
  });
});
