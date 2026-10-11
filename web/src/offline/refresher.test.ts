import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Restaurant } from "../records/types";

vi.mock("../firebase", () => ({ db: {} }));

import { createRefresher, type RefresherDeps } from "./refresher";
import { RefreshDenied, RefreshOffline } from "./serverReads";
import { clearCopy, readCopy, readMeta, readToken, replaceCopy, setOptIn } from "./store";
import type { CopyData } from "./types";

const TARGET = { uid: "ava-uid", householdId: "home", displayName: "Ava" };
const ID = { uid: "ava-uid", householdId: "home" };
const STATS = { queries: 1, documents: 1, emptyQueries: 0 };
const restaurant = (id: string): Restaurant => ({ id, name: id, address: "", createdBy: "ava-uid", createdAt: new Date(0), updatedAt: new Date(0), version: 1, deleting: false });
const copyOf = (...ids: string[]): CopyData => ({
  restaurants: ids.map(restaurant),
  claims: Object.fromEntries(ids.map((id) => [id, []])),
  collection: {},
  notes: Object.fromEntries(ids.map((id) => [id, []])),
});

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => { open = r; });
  return { promise, open };
}

function deps(over: Partial<RefresherDeps> = {}): RefresherDeps {
  let now = 1_000;
  return {
    readHousehold: vi.fn(async () => ({ data: copyOf("a", "b"), stats: STATS })),
    readRestaurant: vi.fn(async () => ({ data: null, stats: STATS })),
    now: () => (now += 1),
    onDenied: vi.fn(),
    pause: async () => {},
    ...over,
  };
}

async function ids() {
  const got = await readCopy(ID);
  return got.kind === "copy" ? got.data.restaurants.map((r) => r.id) : null;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await setOptIn("ava-uid", true);
});

describe("refresher", () => {
  it("a full refresh writes the copy and records success and read stats", async () => {
    const r = createRefresher(deps());
    await r.requestFull(TARGET);
    expect(await ids()).toEqual(["a", "b"]);
    expect(r.status()).toMatchObject({ running: false, lastFailure: null });
    expect(r.status().lastWrittenAt).not.toBeNull();
    expect(r.lastStats()).toEqual(STATS);
  });

  it("a restaurant deleted on the server disappears at the next full refresh (Review Focus 1)", async () => {
    const first = copyOf("a", "b");
    first.claims.b = [{ id: "cb", kind: "gfMenu", value: "yes", detail: "", source: { type: "restaurantStatement", label: "Phone" }, checkedAt: "2026-09-01", authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(0) }];
    first.notes.b = [{ id: "nb", text: "b", authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(0), updatedAt: new Date(0), version: 1 }];
    first.collection.b = { shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: new Date(0), version: 1 };
    const d = deps({ readHousehold: vi.fn(async () => ({ data: first, stats: STATS })) });
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    const before = await readCopy(ID);
    if (before.kind !== "copy") throw new Error("no copy");
    expect(before.data.claims.b!.map((c) => c.id)).toEqual(["cb"]);
    expect(before.data.notes.b!.map((n) => n.id)).toEqual(["nb"]);
    expect(before.data.collection.b!.shortlisted).toBe(true);
    vi.mocked(d.readHousehold).mockResolvedValueOnce({ data: copyOf("a"), stats: STATS });
    await r.requestFull(TARGET);
    expect(await ids()).toEqual(["a"]);
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.claims.b).toBeUndefined();
    expect(got.data.notes.b).toBeUndefined();
    expect(got.data.collection.b).toBeUndefined();
  });

  it("an offline or failed read writes nothing and keeps the previous copy and downloadedAt", async () => {
    const d = deps();
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    const before = (await readMeta())!.downloadedAt;
    vi.mocked(d.readHousehold).mockRejectedValueOnce(new RefreshOffline());
    await r.requestFull(TARGET);
    expect(r.status().lastFailure).toBe("offline");
    expect((await readMeta())!.downloadedAt).toBe(before);
    vi.mocked(d.readHousehold).mockRejectedValueOnce(new Error("boom"));
    await r.requestFull(TARGET);
    expect(r.status().lastFailure).toBe("server");
    expect(await ids()).toEqual(["a", "b"]);
  });

  it("permission-denied does not wipe; it defers to the membership read", async () => {
    const d = deps({ readHousehold: vi.fn(async () => { throw new RefreshDenied(); }) });
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    expect(d.onDenied).toHaveBeenCalledTimes(1);
    expect(r.status().lastFailure).toBe("denied");
  });

  it("single flight: requests during a run coalesce into one more run", async () => {
    const g = gate();
    const d = deps({ pause: () => g.promise });
    const r = createRefresher(d);
    const first = r.requestFull(TARGET);
    void r.requestFull(TARGET);
    void r.requestFull(TARGET);
    g.open();
    await first;
    await vi.waitFor(() => expect(r.status().running).toBe(false));
    expect(d.readHousehold).toHaveBeenCalledTimes(2);
  });

  it("a request landing as the loop finishes is not dropped (final review M4)", async () => {
    const d = deps();
    const r = createRefresher(d);
    let asked = false;
    // The loop's last status update runs after its final while check but before it is released:
    // a request made there (as any subscriber may) used to join the finishing run and be lost.
    const stop = r.subscribe(() => {
      if (!asked && !r.status().running) {
        asked = true;
        void r.requestFull(TARGET);
      }
    });
    await r.requestFull(TARGET);
    await vi.waitFor(() => expect(d.readHousehold).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(r.status().running).toBe(false));
    stop();
  });

  it("switching off while the first download is reading leaves nothing written (Review Focus 2)", async () => {
    const g = gate();
    const r = createRefresher(deps({ pause: () => g.promise }));
    const run = r.requestFull(TARGET);
    await vi.waitFor(async () => expect(r.status().running).toBe(true));
    await setOptIn("ava-uid", false);
    await clearCopy();
    g.open();
    await run;
    await expect(readMeta()).resolves.toBeNull();
    expect(r.status().lastFailure).toBeNull();
  });

  it("work based on older reads than another tab's write is discarded and re-run (review R2-2)", async () => {
    const g = gate();
    const d = deps({ pause: vi.fn().mockImplementationOnce(() => g.promise).mockResolvedValue(undefined) });
    vi.mocked(d.readHousehold).mockResolvedValueOnce({ data: copyOf("older"), stats: STATS }).mockResolvedValue({ data: copyOf("newest"), stats: STATS });
    const r = createRefresher(d);
    const run = r.requestFull(TARGET);
    await vi.waitFor(() => expect(d.readHousehold).toHaveBeenCalledTimes(1));
    await replaceCopy(TARGET, await readToken(), copyOf("other-tab"), 5_000); // another tab wins meanwhile
    g.open();
    await run;
    await vi.waitFor(() => expect(r.status().running).toBe(false));
    expect(await ids()).toEqual(["newest"]);
  });

  it("a partial refresh replaces one restaurant and keeps downloadedAt", async () => {
    const d = deps();
    const r = createRefresher(d);
    await r.requestFull(TARGET);
    const before = (await readMeta())!;
    vi.mocked(d.readRestaurant).mockResolvedValueOnce({ data: { restaurant: { ...restaurant("a"), name: "renamed" }, claims: [], notes: [], state: null }, stats: STATS });
    await r.requestPartial(TARGET, "a");
    const after = (await readMeta())!;
    expect(after.downloadedAt).toBe(before.downloadedAt);
    expect(after.revision).toBe(before.revision + 1);
    const got = await readCopy(ID);
    if (got.kind !== "copy") throw new Error("no copy");
    expect(got.data.restaurants.find((x) => x.id === "a")!.name).toBe("renamed");
  });

  it("a first download refused by storage marks the device as unable to store a copy", async () => {
    const d = deps();
    const r = createRefresher(d);
    vi.stubGlobal("indexedDB", undefined);
    await r.requestFull(TARGET);
    vi.unstubAllGlobals();
    expect(r.status()).toMatchObject({ lastFailure: "storage", cantStore: true });
  });
});
