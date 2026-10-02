import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ auth: { app: { options: { apiKey: "KEY" } } } }));

import { removePersistedUserIfUid } from "./persistedSession";

const KEY = "firebase:authUser:KEY:[DEFAULT]";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("removePersistedUserIfUid", () => {
  it("an IndexedDB open that never fires resolves unavailable within the timeout (G2)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    const result = removePersistedUserIfUid("ava-uid");
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBe("unavailable");
  });

  it("an open that succeeds after the timeout closes the db and deletes nothing (G2)", async () => {
    vi.useFakeTimers();
    const req: Record<string, any> = {};
    vi.stubGlobal("indexedDB", { open: () => req });
    const result = removePersistedUserIfUid("ava-uid");
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toBe("unavailable");
    const close = vi.fn();
    const transaction = vi.fn();
    req.result = { close, transaction, objectStoreNames: { contains: () => true } };
    req.onsuccess();
    expect(close).toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("an open that succeeds after onblocked settled closes the db and does nothing (G2)", async () => {
    const req: Record<string, any> = {};
    vi.stubGlobal("indexedDB", { open: () => req });
    const result = removePersistedUserIfUid("ava-uid");
    req.onblocked();
    await expect(result).resolves.toBe("unavailable");
    const close = vi.fn();
    const transaction = vi.fn();
    req.result = { close, transaction, objectStoreNames: { contains: () => true } };
    req.onsuccess();
    expect(close).toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
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
