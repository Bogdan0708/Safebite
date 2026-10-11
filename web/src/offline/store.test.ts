// @vitest-environment node
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Claim, CollectionState, Note, Restaurant } from "../records/types";
import {
  clearCopy, getOptIn, offlineCopyCleaner, readCopy, readMeta, readToken, recordMembershipCheck,
  replaceCopy, replaceRestaurant, setOptIn,
} from "./store";
import type { CopyData, RestaurantData } from "./types";

const ID = { uid: "ava-uid", householdId: "home" };
const WHO = { ...ID, displayName: "Ava" };
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);

function restaurant(id: string, name = `Place ${id}`): Restaurant {
  return { id, name, address: "1 Test Street", createdBy: "ava-uid", createdAt: new Date(T0), updatedAt: new Date(T0), version: 1, deleting: false };
}
function claim(id: string, checkedAt = "2026-09-01"): Claim {
  return { id, kind: "gfMenu", value: "yes", detail: "", source: { type: "restaurantStatement", label: "Phone" }, checkedAt, authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(T0) };
}
function note(id: string, at: number, text = `Note ${id}`): Note {
  return { id, text, authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(at), updatedAt: new Date(at), version: 1 };
}
const state: CollectionState = { shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: new Date(T0), version: 1 };

function household(...ids: string[]): CopyData {
  const data: CopyData = { restaurants: [], claims: {}, collection: {}, notes: {} };
  for (const id of ids) {
    data.restaurants.push(restaurant(id));
    data.claims[id] = [claim(`${id}-c1`)];
    data.notes[id] = [note(`${id}-n1`, T0)];
    data.collection[id] = state;
  }
  return data;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await setOptIn("ava-uid", true);
});
afterEach(() => vi.restoreAllMocks());

describe("replaceCopy and readCopy", () => {
  it("round-trips a household for the same account and household only", async () => {
    await expect(replaceCopy(WHO, await readToken(), household("a", "b"), T0)).resolves.toBe("written");
    const got = await readCopy(ID);
    expect(got.kind).toBe("copy");
    if (got.kind !== "copy") return;
    expect(got.meta).toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava", revision: 1, downloadedAt: T0, membershipCheckedAt: T0, complete: true });
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["a", "b"]);
    expect(got.data.claims.a![0]!.checkedAt).toBe("2026-09-01");
    expect(got.data.restaurants[0]!.createdAt).toEqual(new Date(T0));
    await expect(readCopy({ uid: "bogdan-uid", householdId: "home" })).resolves.toEqual({ kind: "none" });
    await expect(readCopy({ uid: "ava-uid", householdId: "other" })).resolves.toEqual({ kind: "none" });
  });

  it("refuses without an opt-in for the account", async () => {
    await setOptIn("ava-uid", false);
    await expect(replaceCopy(WHO, await readToken(), household("a"), T0)).resolves.toBe("optedOut");
    await expect(readMeta()).resolves.toBeNull();
  });

  it("refuses to overwrite another account's or household's copy", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    await setOptIn("bogdan-uid", true);
    await expect(replaceCopy({ uid: "bogdan-uid", householdId: "home", displayName: "Bogdan" }, await readToken(), household("b"), T0)).resolves.toBe("otherCopy");
    await expect(replaceCopy({ ...WHO, householdId: "elsewhere" }, await readToken(), household("b"), T0)).resolves.toBe("otherCopy");
  });

  it("orders restaurants by name and notes newest first, whatever the input order", async () => {
    const data = household("b", "a");
    data.restaurants = [restaurant("b", "Zest"), restaurant("a", "Bistro")];
    data.notes.a = [note("old", T0 - 1000), note("new", T0)];
    await replaceCopy(WHO, await readToken(), data, T0);
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.name)).toEqual(["Bistro", "Zest"]);
    expect(got.data.notes.a!.map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("a large household with emoji and non-Latin text round-trips intact (Review Focus 3)", async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `r${String(i).padStart(3, "0")}`);
    const data = household(...ids);
    data.restaurants[7] = restaurant(ids[7]!, "Café Ölçü 🍝 東京");
    data.notes[ids[7]!] = [note("long", T0, "x".repeat(2000) + " 🍞")];
    await expect(replaceCopy(WHO, await readToken(), data, T0)).resolves.toBe("written");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants).toHaveLength(300);
    expect(got.data.restaurants.some((r) => r.name === "Café Ölçü 🍝 東京")).toBe(true);
    expect(got.data.notes[ids[7]!]![0]!.text.endsWith(" 🍞")).toBe(true);
  });
});

describe("cleanup wins and revisions (review P3-13, R2-2)", () => {
  it("a replace whose token predates a clear writes nothing", async () => {
    const token = await readToken();
    await clearCopy();
    await expect(replaceCopy(WHO, token, household("a"), T0)).resolves.toBe("cleared");
    await expect(readMeta()).resolves.toBeNull();
  });

  it("an evicted database (no control row) still aborts a stale replace by epoch equality", async () => {
    await clearCopy();
    await clearCopy();
    const token = await readToken();
    expect(token.epoch).toBe(2);
    globalThis.indexedDB = new IDBFactory(); // the browser evicted everything
    await setOptIn("ava-uid", true);
    await expect(replaceCopy(WHO, token, household("a"), T0)).resolves.toBe("cleared");
  });

  it("full vs full: the older run is stale and the newer data stays", async () => {
    const older = await readToken();
    const newer = await readToken();
    await expect(replaceCopy(WHO, newer, household("new"), T0 + 1)).resolves.toBe("written");
    await expect(replaceCopy(WHO, older, household("old"), T0 + 2)).resolves.toBe("stale");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["new"]);
    expect(got.meta.downloadedAt).toBe(T0 + 1);
  });

  it("partial vs full: a full refresh based on reads older than a partial is stale", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const fullToken = await readToken();
    const partial: RestaurantData = { restaurant: restaurant("a", "Renamed"), claims: [], notes: [], state: null };
    await expect(replaceRestaurant(ID, await readToken(), "a", partial)).resolves.toBe("written");
    await expect(replaceCopy(WHO, fullToken, household("a"), T0 + 5)).resolves.toBe("stale");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants[0]!.name).toBe("Renamed");
  });

  it("full vs partial: a partial based on reads older than a full refresh is stale", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const partialToken = await readToken();
    await replaceCopy(WHO, await readToken(), household("a", "b"), T0 + 5);
    await expect(replaceRestaurant(ID, partialToken, "a", null)).resolves.toBe("stale");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("partial replacement", () => {
  it("replaces one restaurant, keeps downloadedAt and membershipCheckedAt, and increments revision", async () => {
    await replaceCopy(WHO, await readToken(), household("a", "b"), T0);
    const data: RestaurantData = { restaurant: restaurant("a"), claims: [claim("a-c2", "2026-10-01")], notes: [], state: null };
    await expect(replaceRestaurant(ID, await readToken(), "a", data)).resolves.toBe("written");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.meta.revision).toBe(2);
    expect(got.meta.downloadedAt).toBe(T0);
    expect(got.meta.membershipCheckedAt).toBe(T0);
    expect(got.data.claims.a!.map((c) => c.id)).toEqual(["a-c2"]);
    expect(got.data.notes.a ?? []).toEqual([]);
    expect(got.data.collection.a).toBeUndefined();
    expect(got.data.claims.b!.map((c) => c.id)).toEqual(["b-c1"]);
  });

  it("null data removes the restaurant with its claims, notes and collection entry", async () => {
    await replaceCopy(WHO, await readToken(), household("a", "b"), T0);
    await expect(replaceRestaurant(ID, await readToken(), "a", null)).resolves.toBe("written");
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["b"]);
    expect(got.data.claims.a).toBeUndefined();
    expect(got.data.notes.a).toBeUndefined();
    expect(got.data.collection.a).toBeUndefined();
  });

  it("does nothing without a complete copy", async () => {
    await expect(replaceRestaurant(ID, await readToken(), "a", null)).resolves.toBe("noCopy");
  });
});

describe("recordMembershipCheck (review P2-4)", () => {
  it("never creates meta", async () => {
    await recordMembershipCheck(ID, T0);
    await expect(readMeta()).resolves.toBeNull();
  });

  it("renews only a matching copy and leaves revision and downloadedAt alone", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    await recordMembershipCheck({ uid: "ava-uid", householdId: "elsewhere" }, T0 + 10);
    expect((await readMeta())!.membershipCheckedAt).toBe(T0);
    await recordMembershipCheck(ID, T0 + 20);
    expect(await readMeta()).toMatchObject({ membershipCheckedAt: T0 + 20, downloadedAt: T0, revision: 1 });
  });
});

describe("malformed copies and storage failures", () => {
  it("a meta record of the wrong shape reads as malformed", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    await new Promise<void>((resolve) => {
      const open = indexedDB.open("safebite-offline");
      open.onsuccess = () => {
        const tx = open.result.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ uid: "ava-uid", householdId: "home", revision: "x" }, "copy");
        tx.oncomplete = () => { open.result.close(); resolve(); };
      };
    });
    await expect(readCopy(ID)).resolves.toEqual({ kind: "malformed" });
  });

  it("a quota failure rolls the whole replacement back and keeps the previous copy", async () => {
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const realPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "notes") throw new DOMException("full", "QuotaExceededError");
      return realPut.apply(this, args);
    });
    await expect(replaceCopy(WHO, await readToken(), household("x", "y"), T0 + 1)).resolves.toBe("storageFull");
    vi.restoreAllMocks();
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.map((r) => r.id)).toEqual(["a"]);
    expect(got.meta.downloadedAt).toBe(T0);
  });

  it("without IndexedDB, reads are empty, opt-in is off and clearing succeeds", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(readMeta()).resolves.toBeNull();
    await expect(readCopy(ID)).resolves.toEqual({ kind: "none" });
    await expect(getOptIn("ava-uid")).resolves.toBe(false);
    await expect(clearCopy()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("clearCopy and the cleaner", () => {
  it("clearCopy removes the copy, keeps opt-ins, bumps the epoch and announces it", async () => {
    const post = vi.spyOn(BroadcastChannel.prototype, "postMessage");
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const before = await readToken();
    await clearCopy();
    await expect(readMeta()).resolves.toBeNull();
    await expect(readCopy(ID)).resolves.toEqual({ kind: "none" });
    await expect(getOptIn("ava-uid")).resolves.toBe(true);
    expect((await readToken()).epoch).toBe(before.epoch + 1);
    expect(post).toHaveBeenCalledWith({ type: "invalidated" });
  });

  it("the offlineCopy cleaner also removes every opt-in", async () => {
    await setOptIn("bogdan-uid", true);
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    expect(offlineCopyCleaner.name).toBe("offlineCopy");
    await offlineCopyCleaner.clear();
    await expect(readMeta()).resolves.toBeNull();
    await expect(getOptIn("ava-uid")).resolves.toBe(false);
    await expect(getOptIn("bogdan-uid")).resolves.toBe(false);
  });
});

/** Writes a raw meta record, bypassing replaceCopy. */
function putRawMeta(value: unknown): Promise<void> {
  return new Promise<void>((resolve) => {
    const open = indexedDB.open("safebite-offline");
    open.onsuccess = () => {
      const tx = open.result.transaction("meta", "readwrite");
      tx.objectStore("meta").put(value, "copy");
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  });
}

describe("final review fixes", () => {
  it("M1: a transaction aborted under a pending read leaves no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      await replaceCopy(WHO, await readToken(), household("a"), T0);
      const realGet = IDBObjectStore.prototype.get;
      vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["get"]>) {
        const request = realGet.apply(this, args);
        if (this.transaction.mode === "readwrite") this.transaction.abort(); // the read fails with its transaction
        return request;
      });
      await expect(replaceCopy(WHO, await readToken(), household("b"), T0 + 1)).resolves.toBe("unavailable");
      await expect(replaceRestaurant(ID, await readToken(), "a", null)).resolves.toBe("unavailable");
      await expect(recordMembershipCheck(ID, T0 + 2)).resolves.toBeUndefined();
      await expect(clearCopy()).rejects.toBeDefined();
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("M2: the cleaner removes the copy and every opt-in in one transaction", async () => {
    await setOptIn("bogdan-uid", true);
    await replaceCopy(WHO, await readToken(), household("a"), T0);
    const before = await readToken();
    const tx = vi.spyOn(IDBDatabase.prototype, "transaction");
    await offlineCopyCleaner.clear();
    const writes = tx.mock.calls.filter((call) => call[1] === "readwrite");
    tx.mockRestore();
    expect(writes).toHaveLength(1);
    await expect(readMeta()).resolves.toBeNull();
    await expect(readCopy(ID)).resolves.toEqual({ kind: "none" });
    await expect(getOptIn("ava-uid")).resolves.toBe(false);
    await expect(getOptIn("bogdan-uid")).resolves.toBe(false);
    expect((await readToken()).epoch).toBe(before.epoch + 1);
  });

  it("M3: a meta record with a non-finite time or revision is malformed, never a usable copy", async () => {
    const good = { uid: "ava-uid", householdId: "home", displayName: "Ava", revision: 1, downloadedAt: T0, membershipCheckedAt: T0, complete: true };
    for (const bad of [{ downloadedAt: NaN }, { membershipCheckedAt: NaN }, { membershipCheckedAt: Infinity }, { revision: NaN }]) {
      await putRawMeta({ ...good, ...bad });
      await expect(readMeta()).resolves.toBeNull();
      await expect(readCopy(ID)).resolves.toEqual({ kind: "malformed" });
    }
    await putRawMeta(good);
    await expect(readMeta()).resolves.toEqual(good);
  });
});
