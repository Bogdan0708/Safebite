import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { earlyCopyCandidate, type EarlyDeps } from "./early";
import { readToken, replaceCopy, setOptIn } from "./store";
import { COPY_MAX_AGE_MS } from "./types";

const NOW = Date.now();
const deps = (over: Partial<EarlyDeps> = {}): EarlyDeps => ({
  persistentAuthAllowed: () => true,
  readPersistedUid: async () => "ava-uid",
  isDeletedUid: () => false,
  ...over,
});

async function seed(checkedAt = NOW) {
  await setOptIn("ava-uid", true);
  await replaceCopy({ uid: "ava-uid", householdId: "home", displayName: "Ava" }, await readToken(), { restaurants: [], claims: {}, collection: {}, notes: {} }, checkedAt);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

describe("earlyCopyCandidate", () => {
  it("offers the ready copy of the account saved on this device", async () => {
    await seed();
    await expect(earlyCopyCandidate(NOW, deps())).resolves.toEqual({ uid: "ava-uid", householdId: "home", displayName: "Ava", downloadedAt: NOW });
  });
  it.each<[string, Partial<EarlyDeps>]>([
    ["memory-only Auth", { persistentAuthAllowed: () => false }],
    ["no saved user", { readPersistedUid: async () => null }],
    ["an unreadable Auth database", { readPersistedUid: async () => "unavailable" }],
    ["another saved account", { readPersistedUid: async () => "bogdan-uid" }],
    ["a deleted session", { isDeletedUid: () => true }],
  ])("offers nothing with %s", async (_label, over) => {
    await seed();
    await expect(earlyCopyCandidate(NOW, deps(over))).resolves.toBeNull();
  });
  it("offers nothing for an expired or missing copy", async () => {
    await expect(earlyCopyCandidate(NOW, deps())).resolves.toBeNull();
    await seed(NOW - COPY_MAX_AGE_MS - 1);
    await expect(earlyCopyCandidate(NOW, deps())).resolves.toBeNull();
  });
});
