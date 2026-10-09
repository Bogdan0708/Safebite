import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/firebaseConfig", () => ({ firebaseConfig: { apiKey: "KEY" } }));

import { removePersistedUserIfUid, removePersistedUsersIfUids } from "./persistedSession";

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

  it.each([
    [{ value: { uid: "marked-99" } }, "removed"],
    [{ value: { uid: "replacement" } }, "notOurs"],
    [undefined, "notOurs"],
    [{ value: { unexpected: "layout" } }, "unavailable"],
  ])("one open/transaction checks all guarded UIDs and settles after commit: %j", async (record, outcome) => {
    const req: Record<string, any> = {};
    const open = vi.fn(() => req);
    vi.stubGlobal("indexedDB", { open });
    let settled = false;
    const result = removePersistedUsersIfUids(new Set(Array.from({ length: 100 }, (_, i) => `marked-${i}`)));
    void result.then(() => { settled = true; });
    const f = fakeDb(record);
    req.result = f.db;
    req.onsuccess(); f.runGet();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(f.db.transaction).toHaveBeenCalledExactlyOnceWith("firebaseLocalStorage", "readwrite");
    expect(f.store.get).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(f.store.delete).toHaveBeenCalledTimes(outcome === "removed" ? 1 : 0);
    f.tx.oncomplete();
    await expect(result).resolves.toBe(outcome);
  });

  it("an empty batch does not open the database", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    await expect(removePersistedUsersIfUids(new Set())).resolves.toBe("notOurs");
    expect(open).not.toHaveBeenCalled();
  });

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

  it("never reads or removes the legacy localStorage Auth key, including a replacement login", async () => {
    vi.stubGlobal("indexedDB", undefined);
    localStorage.setItem(KEY, JSON.stringify({ uid: "ava-uid" }));
    const read = vi.spyOn(Storage.prototype, "getItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const result = removePersistedUserIfUid("ava-uid");
    localStorage.setItem(KEY, JSON.stringify({ uid: "replacement" }));
    await expect(result).resolves.toBe("unavailable");
    expect(read).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ uid: "replacement" }));
    vi.restoreAllMocks();
  });
});
