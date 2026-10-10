import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Module-graph guard (review P2-5): loading the registry must never load Firebase, or Auth would
// initialise before §3.8's persistence gate and fall back to memory-only for every start.
vi.mock("../firebase", () => { throw new Error("registerCleaners must not import ../firebase"); });
vi.mock("firebase/auth", () => { throw new Error("registerCleaners must not import firebase/auth"); });
vi.mock("firebase/firestore", () => { throw new Error("registerCleaners must not import firebase/firestore"); });

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((d) => d.name ?? "");
}

describe("registerCleaners", () => {
  it("loads without Firebase and registers the offline cleaner", async () => {
    await expect(import("./registerCleaners")).resolves.toBeDefined();
    const { clearDeviceData } = await import("./cleanup");
    const { setOptIn, getOptIn } = await import("../offline/store");
    await setOptIn("ava-uid", true);
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    await expect(getOptIn("ava-uid")).resolves.toBe(false);
  });

  it("cleaner boundary: 5a's Auth intents, the deleted-UID record and Firebase Auth's database survive", async () => {
    await import("./registerCleaners");
    const { clearDeviceData } = await import("./cleanup");
    localStorage.setItem("safebite.authCleanup.ava-uid:confirmed", "1");
    localStorage.setItem("safebite.deletedUids", JSON.stringify(["gone-uid"]));
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("firebaseLocalStorageDb", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
      open.onsuccess = () => { open.result.close(); resolve(); };
    });
    await expect(clearDeviceData()).resolves.toEqual({ failed: [] });
    expect(localStorage.getItem("safebite.authCleanup.ava-uid:confirmed")).toBe("1");
    expect(localStorage.getItem("safebite.deletedUids")).toBe(JSON.stringify(["gone-uid"]));
    expect(await databaseNames()).toContain("firebaseLocalStorageDb");
  });

  it("start-up with a pending clear wipes a seeded copy before the app may render (spec §3.9 Tests)", async () => {
    await import("./registerCleaners");
    const { render, waitFor } = await import("@testing-library/react");
    const { DeviceClearingScreen } = await import("./DeviceClearingScreen");
    const { readMeta, readToken, replaceCopy, setOptIn } = await import("../offline/store");
    await setOptIn("ava-uid", true);
    await replaceCopy({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, Date.now());
    localStorage.setItem("safebite.pendingClear.previous-run", "1");
    let metaWhenCleared: unknown = "not called";
    const onCleared = async () => { metaWhenCleared = await readMeta(); };
    render(<DeviceClearingScreen onCleared={() => void onCleared()} />);
    await waitFor(() => expect(metaWhenCleared).toBeNull());
  });
});
