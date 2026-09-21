import { afterEach, describe, expect, it, vi } from "vitest";
import { unregisterServiceWorkers } from "./serviceWorker";

afterEach(() => {
  // jsdom has no navigator.serviceWorker; each test installs and removes its own fake.
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("unregisterServiceWorkers", () => {
  it("unregisters every registration and reports how many", async () => {
    const unregister = vi.fn(async () => true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: async () => [{ unregister }, { unregister }] },
    });
    await expect(unregisterServiceWorkers()).resolves.toBe(2);
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it("is a no-op where service workers are unsupported", async () => {
    await expect(unregisterServiceWorkers()).resolves.toBe(0);
  });
});
