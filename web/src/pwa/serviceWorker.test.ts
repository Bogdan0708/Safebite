import { afterEach, describe, expect, it, vi } from "vitest";

const { registerSWMock } = vi.hoisted(() => ({ registerSWMock: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({ registerSW: registerSWMock }));

import { registerServiceWorker, unregisterServiceWorkers } from "./serviceWorker";

afterEach(() => {
  // jsdom has no navigator.serviceWorker; each test installs and removes its own fake.
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  registerSWMock.mockClear();
  vi.unstubAllGlobals();
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

describe("registerServiceWorker", () => {
  it("never calls registerSW outside a built bundle", () => {
    vi.stubGlobal("__SAFEBITE_BUILD__", false);
    registerServiceWorker();
    expect(registerSWMock).not.toHaveBeenCalled();
  });

  it("calls registerSW once with { immediate: true } in a built bundle with service worker support", () => {
    vi.stubGlobal("__SAFEBITE_BUILD__", true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {},
    });
    registerServiceWorker();
    expect(registerSWMock).toHaveBeenCalledTimes(1);
    expect(registerSWMock).toHaveBeenCalledWith({ immediate: true });
  });
});
