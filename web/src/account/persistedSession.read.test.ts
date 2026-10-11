import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebaseConfig", () => ({ firebaseConfig: { apiKey: "KEY" } }));

import { readPersistedUid } from "./persistedSession";

const KEY = "firebase:authUser:KEY:[DEFAULT]";

function seedAuthDb(record: unknown | undefined) {
  return new Promise<void>((resolve) => {
    const open = indexedDB.open("firebaseLocalStorageDb", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
    open.onsuccess = () => {
      const tx = open.result.transaction("firebaseLocalStorage", "readwrite");
      if (record !== undefined) tx.objectStore("firebaseLocalStorage").put(record);
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  });
}

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

describe("readPersistedUid", () => {
  it("returns null when no Auth database exists, and leaves none behind", async () => {
    await expect(readPersistedUid()).resolves.toBeNull();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain("firebaseLocalStorageDb");
  });
  it("returns the saved uid", async () => {
    await seedAuthDb({ fbase_key: KEY, value: { uid: "ava-uid" } });
    await expect(readPersistedUid()).resolves.toBe("ava-uid");
  });
  it("returns null when the database holds no saved user", async () => {
    await seedAuthDb(undefined);
    await expect(readPersistedUid()).resolves.toBeNull();
  });
  it("an unexpected layout is unavailable, never a guess", async () => {
    await seedAuthDb({ fbase_key: KEY, value: { unexpected: true } });
    await expect(readPersistedUid()).resolves.toBe("unavailable");
  });
});
