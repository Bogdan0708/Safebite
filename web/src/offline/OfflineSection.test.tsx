import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" } as Record<string, unknown>,
  status: { running: false, lastFailure: null as null | string, lastWrittenAt: null as null | number, cantStore: false },
  optIn: false,
  meta: null as null | Record<string, unknown>,
  persistent: true,
  connected: true,
  setOptIn: vi.fn(),
  clearCopy: vi.fn(async () => {}),
  requestFull: vi.fn(async () => {}),
  notify: vi.fn(),
  clearDeviceData: vi.fn(async () => ({ failed: [] as string[] })),
  persist: vi.fn(async () => true),
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => { return { state: m.state }; } }));
vi.mock("./refresher", () => ({
  refresher: { requestFull: m.requestFull },
  useRefreshStatus: () => { return m.status; },
  notifyOptInChanged: m.notify,
}));
vi.mock("./store", () => ({
  getOptIn: async () => { return m.optIn; },
  setOptIn: m.setOptIn,
  readMeta: async () => { return m.meta; },
  clearCopy: m.clearCopy,
}));
vi.mock("../account/authPersistence", () => ({ persistentAuthAllowed: () => { return m.persistent; } }));
vi.mock("./writeAccess", () => ({ useConnectivity: () => { return m.connected; } }));
vi.mock("../device/cleanup", () => ({ clearDeviceData: m.clearDeviceData }));

import { OfflineSection } from "./OfflineSection";

const META = { uid: "ava-uid", householdId: "home", displayName: "Ava", revision: 1, downloadedAt: new Date(2026, 9, 10, 14, 32).getTime(), membershipCheckedAt: 0, complete: true };

beforeEach(() => {
  vi.clearAllMocks();
  m.state = { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" };
  m.status = { running: false, lastFailure: null, lastWrittenAt: null, cantStore: false };
  m.optIn = false;
  m.meta = null;
  m.persistent = true;
  m.connected = true;
  m.setOptIn.mockReset().mockImplementation(async (_uid: string, on: boolean) => { m.optIn = on; });
  m.persist.mockReset().mockResolvedValue(true);
  Object.defineProperty(navigator, "storage", { configurable: true, value: { persist: m.persist } });
});

describe("OfflineSection", () => {
  it("off: not stored; turning on saves the opt-in, starts the download and asks to persist storage", async () => {
    render(<OfflineSection />);
    expect(await screen.findByTestId("offline-status")).toHaveTextContent("Not stored on this device.");
    m.persist.mockResolvedValueOnce(false);
    await userEvent.click(screen.getByTestId("offline-switch"));
    expect(m.setOptIn).toHaveBeenCalledWith("ava-uid", true);
    expect(m.notify).toHaveBeenCalled();
    expect(m.persist).toHaveBeenCalled();
    expect(await screen.findByTestId("offline-persist-warning")).toHaveTextContent("Your browser may remove this copy if the device runs low on space.");
  });

  it("a granted persist request shows no warning", async () => {
    render(<OfflineSection />);
    await userEvent.click(await screen.findByTestId("offline-switch"));
    await waitFor(() => expect(screen.getByTestId("offline-switch")).toBeChecked());
    expect(screen.queryByTestId("offline-persist-warning")).toBeNull();
  });

  it("opted in without a copy: Downloading… while running, then Not ready offline", async () => {
    m.optIn = true;
    m.status = { ...m.status, running: true };
    const { rerender } = render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Downloading…"));
    m.status = { ...m.status, running: false };
    rerender(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Not ready offline"));
  });

  it("ready: names the update time, and Refresh now requests a full refresh", async () => {
    m.optIn = true;
    m.meta = META;
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Ready offline · updated 10 Oct, 14:32"));
    await userEvent.click(screen.getByTestId("offline-refresh"));
    expect(m.requestFull).toHaveBeenCalledWith({ uid: "ava-uid", householdId: "home", displayName: "Ava" });
  });

  it("Refresh now is disabled offline", async () => {
    m.optIn = true;
    m.meta = META;
    m.connected = false;
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-refresh")).toBeDisabled());
  });

  it("a failed update keeps the copy's time, gives a plain reason and Try again", async () => {
    m.optIn = true;
    m.meta = META;
    m.status = { ...m.status, lastFailure: "offline" };
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Last update failed · copy from 10 Oct, 14:32"));
    expect(screen.getByTestId("offline-reason")).toHaveTextContent("You're offline.");
    await userEvent.click(screen.getByTestId("offline-retry"));
    expect(m.requestFull).toHaveBeenCalled();
  });

  it("a failed first download says Not ready offline with the reason", async () => {
    m.optIn = true;
    m.status = { ...m.status, lastFailure: "server" };
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Not ready offline"));
    expect(screen.getByTestId("offline-reason")).toHaveTextContent("Couldn't reach SafeBite.");
  });

  it("turning off asks first, then removes the copy and the opt-in", async () => {
    m.optIn = true;
    m.meta = META;
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-switch")).toBeChecked());
    await userEvent.click(screen.getByTestId("offline-switch"));
    expect(screen.getByTestId("offline-remove-question")).toHaveTextContent("Remove the offline copy from this device?");
    expect(m.clearCopy).not.toHaveBeenCalled();
    expect(m.setOptIn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("offline-remove-confirm"));
    expect(m.setOptIn).toHaveBeenCalledWith("ava-uid", false);
    expect(m.clearCopy).toHaveBeenCalled();
    expect(m.notify).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Not stored on this device."));
  });

  it("cancelling the opt-out keeps the copy and the switch on", async () => {
    m.optIn = true;
    m.meta = META;
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-switch")).toBeChecked());
    await userEvent.click(screen.getByTestId("offline-switch"));
    await userEvent.click(screen.getByTestId("offline-remove-cancel"));
    expect(screen.queryByTestId("offline-remove-question")).toBeNull();
    expect(screen.getByTestId("offline-switch")).toBeChecked();
    expect(m.clearCopy).not.toHaveBeenCalled();
  });

  it("memory-only sign-in disables the switch and explains why (review P3-11)", async () => {
    m.persistent = false;
    render(<OfflineSection />);
    expect(await screen.findByTestId("offline-memory-only")).toHaveTextContent("Offline copies need sign-in to be saved on this device.");
    expect(screen.getByTestId("offline-switch")).toBeDisabled();
  });

  it("a device that cannot store says so and stays off", async () => {
    m.setOptIn.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    render(<OfflineSection />);
    await userEvent.click(await screen.findByTestId("offline-switch"));
    expect(await screen.findByTestId("offline-cant-store")).toHaveTextContent("This device can't store an offline copy.");
    expect(screen.getByTestId("offline-switch")).not.toBeChecked();
  });

  it("a refused first write turns the switch back off and says the device can't store (ruling m8)", async () => {
    const { rerender } = render(<OfflineSection />);
    await userEvent.click(await screen.findByTestId("offline-switch"));
    await waitFor(() => expect(screen.getByTestId("offline-switch")).toBeChecked());
    m.setOptIn.mockClear();
    m.notify.mockClear();
    m.status = { ...m.status, running: true };
    rerender(<OfflineSection />);
    expect(m.setOptIn).not.toHaveBeenCalled();
    // The refresher's first write was refused (quota) and there is no copy yet.
    m.status = { running: false, lastFailure: "storage", lastWrittenAt: null, cantStore: true };
    rerender(<OfflineSection />);
    await waitFor(() => expect(m.setOptIn).toHaveBeenCalledWith("ava-uid", false));
    expect(m.notify).toHaveBeenCalled();
    expect(screen.getByTestId("offline-switch")).not.toBeChecked();
    expect(screen.getByTestId("offline-cant-store")).toHaveTextContent("This device can't store an offline copy.");
    expect(screen.getByTestId("offline-status")).toHaveTextContent("Not stored on this device.");
  });

  it("opening Settings after a refused first write elsewhere also turns the switch off (ruling m8)", async () => {
    m.optIn = true;
    m.status = { running: false, lastFailure: "storage", lastWrittenAt: null, cantStore: true };
    render(<OfflineSection />);
    await waitFor(() => expect(m.setOptIn).toHaveBeenCalledWith("ava-uid", false));
    await waitFor(() => expect(screen.getByTestId("offline-switch")).not.toBeChecked());
    expect(screen.getByTestId("offline-cant-store")).toBeInTheDocument();
  });

  it("an earlier attempt's can't-store does not turn a new attempt off before it runs", async () => {
    m.status = { running: false, lastFailure: "storage", lastWrittenAt: null, cantStore: true };
    render(<OfflineSection />);
    expect(await screen.findByTestId("offline-cant-store")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("offline-switch"));
    await waitFor(() => expect(screen.getByTestId("offline-switch")).toBeChecked());
    expect(m.setOptIn).toHaveBeenCalledTimes(1);
    expect(m.setOptIn).toHaveBeenCalledWith("ava-uid", true);
  });

  it("a stale can't-store does not turn a re-enabled switch off when the next run fails for another reason", async () => {
    // First write refused for quota earlier; the member frees space and turns the switch on while offline.
    m.status = { running: false, lastFailure: "storage", lastWrittenAt: null, cantStore: true };
    const { rerender } = render(<OfflineSection />);
    await userEvent.click(await screen.findByTestId("offline-switch"));
    await waitFor(() => expect(screen.getByTestId("offline-switch")).toBeChecked());
    m.status = { ...m.status, running: true };
    rerender(<OfflineSection />);
    // The refresher merges fields: an offline failure leaves the earlier cantStore: true in place.
    m.status = { running: false, lastFailure: "offline", lastWrittenAt: null, cantStore: true };
    rerender(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-reason")).toHaveTextContent("You're offline."));
    expect(screen.getByTestId("offline-switch")).toBeChecked();
    expect(m.setOptIn).not.toHaveBeenCalledWith("ava-uid", false);
    expect(screen.queryByTestId("offline-cant-store")).toBeNull();
    expect(screen.getByTestId("offline-status")).toHaveTextContent("Not ready offline");
  });

  it("a storage failure on a later refresh keeps the switch on (the copy stays)", async () => {
    m.optIn = true;
    m.meta = META;
    m.status = { running: false, lastFailure: "storage", lastWrittenAt: null, cantStore: false };
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Last update failed · copy from 10 Oct, 14:32"));
    expect(screen.getByTestId("offline-reason")).toHaveTextContent("Storage is full or unavailable on this device.");
    expect(screen.getByTestId("offline-switch")).toBeChecked();
    expect(m.setOptIn).not.toHaveBeenCalled();
  });

  it("offlineMember with no email renders, and Refresh now is disabled", async () => {
    m.state = { status: "offlineMember", uid: "ava-uid", email: null, householdId: "home", displayName: "Ava", downloadedAt: META.downloadedAt, provisional: true };
    m.optIn = true;
    m.meta = META;
    render(<OfflineSection />);
    await waitFor(() => expect(screen.getByTestId("offline-status")).toHaveTextContent("Ready offline · updated 10 Oct, 14:32"));
    expect(screen.getByTestId("offline-refresh")).toBeDisabled();
  });

  it("shows the Home Screen note", async () => {
    render(<OfflineSection />);
    expect(await screen.findByTestId("offline-section")).toHaveTextContent("Works best in the app installed on your Home Screen. In a browser tab, the browser may remove the copy after a week without use.");
  });

  it("Clear device data runs the cleanup registry and reports the result", async () => {
    render(<OfflineSection />);
    m.clearDeviceData.mockResolvedValueOnce({ failed: ["offlineCopy"] });
    await act(async () => { await userEvent.click(screen.getByTestId("device-clear")); });
    expect(m.clearDeviceData).toHaveBeenCalled();
    expect(await screen.findByTestId("device-clear-result")).toHaveTextContent("Some data on this device couldn't be cleared.");
  });

  it("Clear device data reports success", async () => {
    render(<OfflineSection />);
    await act(async () => { await userEvent.click(screen.getByTestId("device-clear")); });
    expect(await screen.findByTestId("device-clear-result")).toHaveTextContent("Data on this device was cleared.");
  });
});
