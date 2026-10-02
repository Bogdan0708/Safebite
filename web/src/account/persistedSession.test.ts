import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ auth: { app: { options: { apiKey: "KEY" } } } }));

import { removePersistedUserIfUid } from "./persistedSession";

const KEY = "firebase:authUser:KEY:[DEFAULT]";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("removePersistedUserIfUid", () => {
  // A fake database whose single get/delete the test drives by hand.
  function fakeDb(record: unknown) {
    const getReq: Record<string, any> = {};
    const tx: Record<string, any> = {};
    const store = { get: vi.fn(() => getReq), delete: vi.fn() };
    tx.objectStore = () => store;
    const db = { close: vi.fn(), transaction: vi.fn(() => tx), objectStoreNames: { contains: () => true } };
    const runGet = () => { getReq.result = record; getReq.onsuccess(); };
    return { db, tx, store, runGet };
  }

  it("an IndexedDB open that never fires resolves unavailable at 5000 ms, not before (G2)", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    let result: string | undefined;
    void removePersistedUserIfUid("ava-uid").then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(4999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe("unavailable");
    expect(warn).toHaveBeenCalledWith("safebite: persisted-session removal timed out");
    warn.mockRestore();
  });

  it("an open that succeeds after the timeout still deletes a matching record (G2)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const req: Record<string, any> = {};
    vi.stubGlobal("indexedDB", { open: () => req });
    const result = removePersistedUserIfUid("ava-uid");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBe("unavailable");
    const f = fakeDb({ value: { uid: "ava-uid" } });
    req.result = f.db;
    req.onsuccess();
    f.runGet();
    expect(f.store.delete).toHaveBeenCalledWith(KEY);
    f.tx.oncomplete();
    expect(f.db.close).toHaveBeenCalled();
  });

  it("an open that succeeds after the timeout leaves a non-matching record (G2)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const req: Record<string, any> = {};
    vi.stubGlobal("indexedDB", { open: () => req });
    const result = removePersistedUserIfUid("ava-uid");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBe("unavailable");
    const f = fakeDb({ value: { uid: "someone-else" } });
    req.result = f.db;
    req.onsuccess();
    f.runGet();
    expect(f.store.delete).not.toHaveBeenCalled();
    f.tx.oncomplete();
  });

  it("a transaction slower than 5000 ms after a successful open is not cut short (G2)", async () => {
    vi.useFakeTimers();
    const req: Record<string, any> = {};
    vi.stubGlobal("indexedDB", { open: () => req });
    let result: string | undefined;
    void removePersistedUserIfUid("ava-uid").then((r) => { result = r; });
    const f = fakeDb({ value: { uid: "ava-uid" } });
    req.result = f.db;
    req.onsuccess();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(result).toBeUndefined();
    f.runGet();
    f.tx.oncomplete();
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBe("removed");
  });

  it("an open that succeeds after onblocked still deletes only a matching uid (G2)", async () => {
    const req: Record<string, any> = {};
    vi.stubGlobal("indexedDB", { open: () => req });
    const result = removePersistedUserIfUid("ava-uid");
    req.onblocked();
    await expect(result).resolves.toBe("unavailable");
    const other = fakeDb({ value: { uid: "someone-else" } });
    req.result = other.db;
    req.onsuccess();
    other.runGet();
    expect(other.store.delete).not.toHaveBeenCalled();
    const mine = fakeDb({ value: { uid: "ava-uid" } });
    req.result = mine.db;
    req.onsuccess();
    mine.runGet();
    expect(mine.store.delete).toHaveBeenCalledWith(KEY);
  });

  it("without IndexedDB, localStorage removes only a matching uid", async () => {
    vi.stubGlobal("indexedDB", undefined);
    localStorage.setItem(KEY, JSON.stringify({ uid: "other" }));
    await expect(removePersistedUserIfUid("ava-uid")).resolves.toBe("notOurs");
    expect(localStorage.getItem(KEY)).not.toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ uid: "ava-uid" }));
    await expect(removePersistedUserIfUid("ava-uid")).resolves.toBe("removed");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
