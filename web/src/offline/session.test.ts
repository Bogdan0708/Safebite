import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resetDocument, clearDeviceData } = vi.hoisted(() => ({ resetDocument: vi.fn(), clearDeviceData: vi.fn(async () => ({ failed: [] })) }));
vi.mock("../auth/resetDocument", () => ({ resetDocument }));
vi.mock("../device/cleanup", async (importOriginal) => ({ ...(await importOriginal<typeof import("../device/cleanup")>()), clearDeviceData }));

import {
  beginServingCopy, checkServedCopy, getCopySession, isServingCopy, loadUsableCopy, reportDenied,
  setCopySession, setDeniedHandler, startCopyWatch,
} from "./session";
import { readToken, replaceCopy, setOptIn } from "./store";
import { COPY_MAX_AGE_MS } from "./types";

const ID = { uid: "ava-uid", householdId: "home" };
const NOW = Date.now();

async function seedCopy(at = NOW) {
  await setOptIn("ava-uid", true);
  await replaceCopy({ ...ID, displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, at);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  setCopySession(null);
});
afterEach(() => {
  vi.clearAllMocks();
  setDeniedHandler(null);
});

describe("serving state", () => {
  it("offlineMember always serves the copy; member serves while any watcher holds a lease", () => {
    expect(isServingCopy()).toBe(false);
    setCopySession({ ...ID, mode: "offlineMember" });
    expect(isServingCopy()).toBe(true);
    setCopySession({ ...ID, mode: "member" });
    expect(isServingCopy()).toBe(false);
    const release = beginServingCopy();
    expect(isServingCopy()).toBe(true);
    release();
    release(); // idempotent
    expect(isServingCopy()).toBe(false);
    expect(getCopySession()).toEqual({ ...ID, mode: "member" });
  });

  it("reportDenied reaches the registered handler", () => {
    const handler = vi.fn();
    setDeniedHandler(handler);
    reportDenied();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("loadUsableCopy", () => {
  it("returns the copy for the session's account and household", async () => {
    await seedCopy();
    setCopySession({ ...ID, mode: "member" });
    await expect(loadUsableCopy()).resolves.toMatchObject({ meta: { uid: "ava-uid" } });
  });

  it("returns null without a session, for another account, past 30 days, or with a pending clear", async () => {
    await seedCopy();
    await expect(loadUsableCopy()).resolves.toBeNull();
    setCopySession({ uid: "bogdan-uid", householdId: "home", mode: "member" });
    await expect(loadUsableCopy()).resolves.toBeNull();
    setCopySession({ ...ID, mode: "member" });
    await expect(loadUsableCopy(NOW + COPY_MAX_AGE_MS + 1)).resolves.toBeNull();
    localStorage.setItem("safebite.pendingClear.x", "1");
    await expect(loadUsableCopy()).resolves.toBeNull();
  });

  it("a malformed copy is wiped through the cleanup path and never returned", async () => {
    await seedCopy();
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("safebite-offline");
      open.onsuccess = () => {
        const tx = open.result.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ broken: true }, "copy");
        tx.oncomplete = () => { open.result.close(); resolve(); };
      };
    });
    setCopySession({ ...ID, mode: "member" });
    await expect(loadUsableCopy()).resolves.toBeNull();
    expect(clearDeviceData).toHaveBeenCalledTimes(1);
  });
});

describe("cross-tab invalidation (review R2-5)", () => {
  it("an invalidation signal resets a document that is showing copy data, and only then", async () => {
    const stop = startCopyWatch();
    setCopySession({ ...ID, mode: "member" });
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.t", newValue: "1" }));
    expect(resetDocument).not.toHaveBeenCalled();
    setCopySession({ ...ID, mode: "offlineMember" });
    window.dispatchEvent(new StorageEvent("storage", { key: "safebite.pendingClear.t", newValue: "1" }));
    expect(resetDocument).toHaveBeenCalledTimes(1);
    stop();
  });

  it("on resume, a copy that is no longer usable resets the document", async () => {
    await seedCopy();
    const stop = startCopyWatch();
    setCopySession({ ...ID, mode: "offlineMember" });
    await setOptIn("ava-uid", false); // another tab opted out while this one was suspended
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(resetDocument).toHaveBeenCalledTimes(1));
    stop();
  });

  it("the open-session check resets when the 30-day limit passes (review contract)", async () => {
    await seedCopy();
    setCopySession({ ...ID, mode: "offlineMember" });
    await checkServedCopy(NOW + 1000);
    expect(resetDocument).not.toHaveBeenCalled();
    await checkServedCopy(NOW + COPY_MAX_AGE_MS + 1);
    expect(resetDocument).toHaveBeenCalledTimes(1);
  });
});
