import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyUpdate, getUpdateState, resetUpdatesForTests, subscribeToUpdates, updateAvailable, workerActivated } from "./updates";

beforeEach(() => resetUpdatesForTests());

describe("updates store", () => {
  it("starts idle and becomes available when a new worker is waiting, notifying subscribers", () => {
    const listener = vi.fn();
    subscribeToUpdates(listener);
    expect(getUpdateState()).toBe("idle");
    updateAvailable(async () => {});
    expect(getUpdateState()).toBe("available");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("Reload while available asks the waiting worker to take over and does not reload the page itself", () => {
    const update = vi.fn(async () => {});
    const reload = vi.fn();
    updateAvailable(update);
    applyUpdate(reload);
    expect(update).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads this tab when the worker activates only if this tab asked for the update", () => {
    const reload = vi.fn();
    updateAvailable(async () => {});
    applyUpdate(vi.fn());
    workerActivated(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("a tab that did not ask is moved to 'activated' and keeps running (audit F5: no forced reload of other tabs)", () => {
    const listener = vi.fn();
    const reload = vi.fn();
    updateAvailable(async () => {});
    subscribeToUpdates(listener);
    workerActivated(reload);
    expect(reload).not.toHaveBeenCalled();
    expect(getUpdateState()).toBe("activated");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("Reload while activated reloads this tab", () => {
    const reload = vi.fn();
    workerActivated(vi.fn());
    applyUpdate(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Reload while idle does nothing", () => {
    const reload = vi.fn();
    applyUpdate(reload);
    expect(reload).not.toHaveBeenCalled();
  });

  it("workerActivated called twice in a non-requesting tab notifies subscribers once and stays 'activated'", () => {
    const listener = vi.fn();
    const reload = vi.fn();
    updateAvailable(async () => {});
    subscribeToUpdates(listener);
    workerActivated(reload);
    workerActivated(reload);
    expect(reload).not.toHaveBeenCalled();
    expect(getUpdateState()).toBe("activated");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("workerActivated called twice in a requesting tab is inert beyond calling reload again", () => {
    const reload = vi.fn();
    updateAvailable(async () => {});
    applyUpdate(vi.fn());
    const stateBefore = getUpdateState();
    expect(() => {
      workerActivated(reload);
      workerActivated(reload);
    }).not.toThrow();
    expect(reload).toHaveBeenCalledTimes(2);
    expect(getUpdateState()).toBe(stateBefore);
  });

  it("unsubscribe stops notifications", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUpdates(listener);
    unsubscribe();
    updateAvailable(async () => {});
    expect(listener).not.toHaveBeenCalled();
  });
});
