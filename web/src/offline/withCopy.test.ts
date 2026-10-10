import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../records/repository";
import type { Note, Restaurant } from "../records/types";
import { isServingCopy, setCopySession, setDeniedHandler } from "./session";
import { readToken, replaceCopy, setOptIn } from "./store";
import type { CopyData } from "./types";
import { NOT_IN_COPY, withCopy } from "./withCopy";

vi.mock("../auth/resetDocument", () => ({ resetDocument: vi.fn() }));

const ID = { uid: "ava-uid", householdId: "home" };
const r = (id: string): Restaurant => ({ id, name: id, address: "", createdBy: "ava-uid", createdAt: new Date(0), updatedAt: new Date(0), version: 1, deleting: false });
const note = (id: string, at: number): Note => ({ id, text: id, authorUid: "ava-uid", authorName: "Ava", createdAt: new Date(at), updatedAt: new Date(at), version: 1 });

async function seed() {
  await setOptIn("ava-uid", true);
  const data: CopyData = { restaurants: [r("a")], claims: { a: [] }, collection: {}, notes: { a: [note("old", 1), note("new", 2)] } };
  await replaceCopy({ ...ID, displayName: "Ava" }, await readToken(), data, Date.now());
}

/** A fake live listener the test drives. */
function live<T>() {
  let emit: (s: Snapshot<T>) => void = () => {};
  const subscribe = vi.fn((cb: (s: Snapshot<T>) => void) => { emit = cb; return vi.fn(); });
  return { subscribe, emit: (s: Snapshot<T>) => emit(s) };
}

const restaurantsFromCopy = (copy: CopyData): Snapshot<Restaurant[]> => ({ status: "offline", source: "copy", value: copy.restaurants });
const restaurantFromCopy = (rid: string) => (copy: CopyData): Snapshot<Restaurant> => {
  const found = copy.restaurants.find((x) => x.id === rid);
  return found ? { status: "offline", source: "copy", value: found } : { status: "error", message: NOT_IN_COPY, cacheMiss: true };
};

// Every subscription is closed after each test so no serving lease outlives its test.
const opened: Array<() => void> = [];
function open<T>(sub: (cb: (s: Snapshot<T>) => void) => () => void, cb: (s: Snapshot<T>) => void): () => void {
  const stop = sub(cb);
  opened.push(stop);
  return stop;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  setCopySession(null);
  setDeniedHandler(null);
});
afterEach(() => {
  for (const stop of opened.splice(0)) stop();
});

describe("withCopy", () => {
  it("without a copy session it passes snapshots straight through, synchronously", () => {
    const l = live<Restaurant[]>();
    const seen: unknown[] = [];
    open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    expect(seen).toEqual([{ status: "offline", value: [] }]);
  });

  it("member: a cache-served snapshot is replaced by the copy; a server snapshot wins back (P2-2)", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({ status: "offline", source: "copy" });
    expect(isServingCopy()).toBe(true);
    l.emit({ status: "ready", value: [r("live")] });
    expect(seen[1]).toEqual({ status: "ready", value: [r("live")] });
    expect(isServingCopy()).toBe(false);
  });

  it("a server snapshot arriving while the copy is being read is never overwritten by it", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    l.emit({ status: "ready", value: [r("live")] });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toEqual([{ status: "ready", value: [r("live")] }]);
    expect(isServingCopy()).toBe(false);
  });

  it("a cached miss reads the restaurant from the copy, or keeps the not-loaded error", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    for (const [rid, expected] of [["a", "offline"], ["zz", "error"]] as const) {
      const l = live<Restaurant>();
      const seen: Array<Snapshot<Restaurant>> = [];
      open(withCopy(l.subscribe, restaurantFromCopy(rid)), (s) => seen.push(s));
      l.emit({ status: "error", message: NOT_IN_COPY, cacheMiss: true });
      await vi.waitFor(() => expect(seen).toHaveLength(1));
      expect(seen[0]!.status).toBe(expected);
    }
  });

  it("the not-in-copy error takes no serving lease: an error screen is not serving a copy (m15)", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant>();
    const seen: Array<Snapshot<Restaurant>> = [];
    open(withCopy(l.subscribe, restaurantFromCopy("zz")), (s) => seen.push(s));
    l.emit({ status: "error", message: NOT_IN_COPY, cacheMiss: true });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({ status: "error", message: NOT_IN_COPY, cacheMiss: true });
    expect(isServingCopy()).toBe(false);
  });

  it("takes one lease however often the cache re-emits, and releases it exactly once on unsubscribe", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    const stop = open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    l.emit({ status: "offline", value: [] });
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(isServingCopy()).toBe(true);
    stop();
    expect(isServingCopy()).toBe(false);
    stop();
    expect(isServingCopy()).toBe(false);
  });

  it("releases the lease when the copy stops being usable, and shows the live snapshot instead", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(isServingCopy()).toBe(true);
    await setOptIn("ava-uid", false);
    l.emit({ status: "offline", value: [r("cached")] });
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toEqual({ status: "offline", value: [r("cached")] });
    expect(isServingCopy()).toBe(false);
  });

  it("a subscription closed while the copy is being read takes no lease and emits nothing", async () => {
    await seed();
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: unknown[] = [];
    const stop = open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    l.emit({ status: "offline", value: [] });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toEqual([]);
    expect(isServingCopy()).toBe(false);
  });

  it("offlineMember creates no live listener and serves the copy", async () => {
    await seed();
    setCopySession({ ...ID, mode: "offlineMember" });
    const l = live<Restaurant[]>();
    const seen: Array<Snapshot<Restaurant[]>> = [];
    open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    expect(l.subscribe).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(seen[0]).toMatchObject({ status: "offline", source: "copy" }));
  });

  it("notes from the copy stay newest first (Review Focus 4)", async () => {
    await seed();
    setCopySession({ ...ID, mode: "offlineMember" });
    const seen: Array<Snapshot<Note[]>> = [];
    open(withCopy<Note[]>(live<Note[]>().subscribe, (copy) => ({ status: "offline", source: "copy", value: copy.notes.a ?? [] })), (s) => seen.push(s));
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    const first = seen[0]!;
    expect(first.status === "offline" ? first.value.map((n) => n.id) : null).toEqual(["new", "old"]);
  });

  it("a denial is reported for a membership re-read and releases the copy", async () => {
    const denied = vi.fn();
    setDeniedHandler(denied);
    setCopySession({ ...ID, mode: "member" });
    const l = live<Restaurant[]>();
    const seen: unknown[] = [];
    open(withCopy(l.subscribe, restaurantsFromCopy), (s) => seen.push(s));
    l.emit({ status: "denied" });
    expect(denied).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ status: "denied" }]);
  });
});
