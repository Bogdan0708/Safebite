import { afterEach, describe, expect, it, vi } from "vitest";

const { registerSWMock } = vi.hoisted(() => ({ registerSWMock: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({ registerSW: registerSWMock }));

import { purgeServiceWorkerState, registerServiceWorker } from "./serviceWorker";

afterEach(() => {
  // jsdom has no navigator.serviceWorker; each test installs and removes its own fake.
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  registerSWMock.mockClear();
  vi.unstubAllGlobals();
});

function fakeServiceWorker(registrations: Array<{ unregister: () => Promise<boolean> }>, controller: unknown = null) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { controller, getRegistrations: async () => registrations },
  });
}
function fakeCaches(names: string[]) {
  const deleted: string[] = [];
  vi.stubGlobal("caches", { keys: async () => names, delete: async (name: string) => (deleted.push(name), true) });
  return deleted;
}

describe("purgeServiceWorkerState", () => {
  it("unregisters every registration, deletes every cache, and reports whether the page was controlled", async () => {
    const unregister = vi.fn(async () => true);
    fakeServiceWorker([{ unregister }, { unregister }], { scriptURL: "http://127.0.0.1/sw.js" });
    const deleted = fakeCaches(["workbox-precache-v2-http://127.0.0.1/", "other"]);
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 2, caches: 2, wasControlled: true });
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual(["workbox-precache-v2-http://127.0.0.1/", "other"]);
  });

  it("reports an uncontrolled page and still deletes caches", async () => {
    fakeServiceWorker([]);
    const deleted = fakeCaches(["stale"]);
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 0, caches: 1, wasControlled: false });
    expect(deleted).toEqual(["stale"]);
  });

  it("is a no-op where service workers and Cache Storage are unsupported", async () => {
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 0, caches: 0, wasControlled: false });
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
