import { afterEach, describe, expect, it, vi } from "vitest";

const { registerSWMock } = vi.hoisted(() => ({ registerSWMock: vi.fn() }));
vi.mock("virtual:pwa-register", () => ({ registerSW: registerSWMock }));

import { alreadyReloadedForPurge, purgeServiceWorkerState, registerServiceWorker } from "./serviceWorker";
import { applyUpdate, getUpdateState, resetUpdatesForTests } from "./updates";

afterEach(() => {
  // jsdom has no navigator.serviceWorker; each test installs and removes its own fake.
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  registerSWMock.mockClear();
  vi.unstubAllGlobals();
  resetUpdatesForTests();
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
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 2, caches: 2, wasControlled: true, failed: 0 });
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual(["workbox-precache-v2-http://127.0.0.1/", "other"]);
  });

  it("reports an uncontrolled page and still deletes caches", async () => {
    fakeServiceWorker([]);
    const deleted = fakeCaches(["stale"]);
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 0, caches: 1, wasControlled: false, failed: 0 });
    expect(deleted).toEqual(["stale"]);
  });

  it("keeps going when one unregister and one cache delete reject", async () => {
    const unregisterA = vi.fn(async () => {
      throw new Error("unregister failed");
    });
    const unregisterB = vi.fn(async () => true);
    fakeServiceWorker([{ unregister: unregisterA }, { unregister: unregisterB }], { scriptURL: "http://127.0.0.1/sw.js" });
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["a", "b", "c"],
      delete: async (name: string) => {
        deleted.push(name);
        if (name === "b") throw new Error("delete failed");
        return true;
      },
    });
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 1, caches: 2, wasControlled: true, failed: 2 });
    expect(unregisterA).toHaveBeenCalledTimes(1);
    expect(unregisterB).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual(["a", "b", "c"]);
  });

  it("is a no-op where service workers and Cache Storage are unsupported", async () => {
    await expect(purgeServiceWorkerState()).resolves.toEqual({ registrations: 0, caches: 0, wasControlled: false, failed: 0 });
  });
});

describe("alreadyReloadedForPurge", () => {
  it("is false the first time and true the second time it is asked", () => {
    expect(alreadyReloadedForPurge()).toBe(false);
    expect(alreadyReloadedForPurge()).toBe(true);
  });

  it("is true when sessionStorage throws (no storage → never reload)", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("sessionStorage blocked");
      },
    });
    try {
      expect(alreadyReloadedForPurge()).toBe(true);
    } finally {
      Object.defineProperty(window, "sessionStorage", original);
    }
  });
});

describe("registerServiceWorker", () => {
  it("never calls registerSW outside a built bundle", () => {
    vi.stubGlobal("__SAFEBITE_BUILD__", false);
    registerServiceWorker();
    expect(registerSWMock).not.toHaveBeenCalled();
  });

  it("registers once in prompt mode and routes the plugin callbacks into the update store", async () => {
    vi.stubGlobal("__SAFEBITE_BUILD__", true);
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
    const updateServiceWorker = vi.fn(async () => {});
    registerSWMock.mockReturnValue(updateServiceWorker);
    registerServiceWorker();
    expect(registerSWMock).toHaveBeenCalledTimes(1);
    const options = registerSWMock.mock.calls[0]![0] as { immediate: boolean; onNeedRefresh: () => void; onNeedReload: () => void };
    expect(options.immediate).toBe(true);

    options.onNeedRefresh();
    expect(getUpdateState()).toBe("available");
    applyUpdate(vi.fn());
    expect(updateServiceWorker).toHaveBeenCalledTimes(1);

    // Another tab's activation, in a tab that did not ask: no reload, state becomes "activated".
    resetUpdatesForTests();
    options.onNeedRefresh();
    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadSpy });
    options.onNeedReload();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(getUpdateState()).toBe("activated");
  });
});
