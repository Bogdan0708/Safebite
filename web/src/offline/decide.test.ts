import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideNoAnswer, HOUSEHOLD_CHANGED_KEY, prepareMemberCopy } from "./decide";
import { setCopySession } from "./session";
import { readMeta, readToken, replaceCopy, setOptIn } from "./store";
import { COPY_MAX_AGE_MS } from "./types";

const NOW = Date.now();
const empty = { restaurants: [], claims: {}, collection: {}, notes: {} };

async function seed(householdId = "home", checkedAt = NOW, uid = "ava-uid") {
  await setOptIn(uid, true);
  await replaceCopy({ uid, householdId, displayName: "Ava" }, await readToken(), empty, checkedAt);
}

/** Overwrites the meta record with one of the wrong shape (no uid). */
function corruptMeta(): Promise<void> {
  return new Promise<void>((resolve) => {
    const open = indexedDB.open("safebite-offline");
    open.onsuccess = () => {
      const tx = open.result.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ householdId: "home", revision: "x" }, "copy");
      tx.oncomplete = () => { open.result.close(); resolve(); };
    };
  });
}

function rawMeta(): Promise<unknown> {
  return new Promise((resolve) => {
    const open = indexedDB.open("safebite-offline");
    open.onupgradeneeded = () => {
      open.result.createObjectStore("meta");
    };
    open.onsuccess = () => {
      const req = open.result.transaction("meta", "readonly").objectStore("meta").get("copy");
      req.onsuccess = () => { open.result.close(); resolve(req.result); };
    };
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
  setCopySession(null);
});

describe("decideNoAnswer", () => {
  it("opens a usable copy for the signed-in account", async () => {
    await seed();
    await expect(decideNoAnswer("ava-uid", NOW)).resolves.toEqual({ kind: "open", householdId: "home", displayName: "Ava", downloadedAt: NOW });
  });
  it("reports an expired copy separately, and nothing for another account's copy", async () => {
    await seed("home", NOW - COPY_MAX_AGE_MS - 1);
    await expect(decideNoAnswer("ava-uid", NOW)).resolves.toEqual({ kind: "expired" });
    await expect(decideNoAnswer("bogdan-uid", NOW)).resolves.toEqual({ kind: "none" });
  });
  it("a pending clear blocks opening", async () => {
    await seed();
    localStorage.setItem("safebite.pendingClear.t", "1");
    await expect(decideNoAnswer("ava-uid", NOW)).resolves.toEqual({ kind: "none" });
  });
});

describe("prepareMemberCopy", () => {
  it("a different household clears the copy and reports the change to an opted-in account (ruling 8)", async () => {
    await seed("old-home");
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: true });
    await expect(readMeta()).resolves.toBeNull();
  });
  it("another account's leftover copy is cleared silently; a matching copy is renewed", async () => {
    await seed("home", NOW - 1000, "bogdan-uid");
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: false });
    await expect(readMeta()).resolves.toBeNull();
    await seed("home", NOW - 1000);
    await prepareMemberCopy("ava-uid", "home", NOW);
    expect((await readMeta())!.membershipCheckedAt).toBe(NOW);
  });
  it("a malformed meta record is cleared so it cannot block later downloads (Task 3/4 review)", async () => {
    await seed();
    await corruptMeta();
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: false });
    await expect(rawMeta()).resolves.toBeUndefined();
  });
  it("no copy at all: nothing to clear and no meta created", async () => {
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: false });
    await expect(rawMeta()).resolves.toBeUndefined();
  });
});

describe("household-move notice across this document's own reset (final review I1)", () => {
  it("is carried only when this document shows copy data, and read once by the next member start", async () => {
    await seed("old-home");
    setCopySession({ uid: "ava-uid", householdId: "old-home", mode: "offlineMember" });
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: true });
    expect(sessionStorage.getItem(HOUSEHOLD_CHANGED_KEY)).not.toBeNull();
    setCopySession(null); // the reloaded document
    await expect(prepareMemberCopy("ava-uid", "home", NOW + 1000)).resolves.toEqual({ householdChanged: true });
    expect(sessionStorage.getItem(HOUSEHOLD_CHANGED_KEY)).toBeNull();
    await expect(prepareMemberCopy("ava-uid", "home", NOW + 2000)).resolves.toEqual({ householdChanged: false });
  });
  it("is not carried by a document that is not showing copy data (no reset follows)", async () => {
    await seed("old-home");
    await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: true });
    expect(sessionStorage.getItem(HOUSEHOLD_CHANGED_KEY)).toBeNull();
  });
  it("is ignored, and discarded, for another account or household, when stale, or when malformed", async () => {
    for (const value of [
      JSON.stringify({ uid: "bogdan-uid", householdId: "home", at: NOW }),
      JSON.stringify({ uid: "ava-uid", householdId: "elsewhere", at: NOW }),
      JSON.stringify({ uid: "ava-uid", householdId: "home", at: NOW - 61_000 }),
      "{not json",
    ]) {
      sessionStorage.setItem(HOUSEHOLD_CHANGED_KEY, value);
      await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: false });
      expect(sessionStorage.getItem(HOUSEHOLD_CHANGED_KEY)).toBeNull();
    }
  });
  it("blocked sessionStorage only loses the notice", async () => {
    await seed("old-home");
    setCopySession({ uid: "ava-uid", householdId: "old-home", mode: "offlineMember" });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: true });
      await expect(readMeta()).resolves.toBeNull();
      await expect(prepareMemberCopy("ava-uid", "home", NOW)).resolves.toEqual({ householdChanged: false });
    } finally {
      set.mockRestore();
      get.mockRestore();
    }
  });
});
