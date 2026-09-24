import { serverTimestamp, Timestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryTransactions, type Store } from "../test/memoryFirestore";

const m = vi.hoisted(() => ({ runTransaction: vi.fn(), onSnapshot: vi.fn() }));

vi.mock("../firebase", () => ({ db: { fake: true } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    runTransaction: m.runTransaction,
    onSnapshot: m.onSnapshot,
    getDocsFromServer: vi.fn(),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (parent: unknown, ...segments: string[]) => {
      const base = typeof (parent as { path?: string }).path === "string" ? (parent as { path: string }).path : "";
      const path = [base, ...segments].filter(Boolean).join("/");
      return { id: segments[segments.length - 1] ?? "", path };
    },
    query: (source: unknown) => source,
    orderBy: () => undefined,
    limit: () => undefined,
  };
});

import { setShortlisted, setVisited, watchCollection, watchCollectionEntry } from "./collection";

const RP = "households/home/restaurants/r1";
const SP = "households/home/collection/r1";
const AVA = { uid: "ava-uid", displayName: "Ava" };
const live = { name: "Da Marco", address: "Via Roma 1", deleting: false, version: 2 };
const stored = { shortlisted: true, visited: true, visitedOn: Timestamp.fromDate(new Date("2026-05-03T00:00:00Z")), updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: Timestamp.fromDate(new Date("2026-05-03T10:00:00Z")), version: 3 };

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => vi.clearAllMocks());

describe("setShortlisted / setVisited", () => {
  it("creates version 1 from base 0 with the author's identity and a server timestamp", async () => {
    const store: Store = new Map([[RP, live]]);
    memoryTransactions(m.runTransaction, store);
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "ok", value: 1 });
    expect(store.get(SP)).toEqual({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: serverTimestamp(), version: 1 });
  });

  it("changing the shortlist keeps the visit date and bumps the version", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [SP, stored]]);
    memoryTransactions(m.runTransaction, store);
    expect(await setShortlisted("home", "r1", AVA, 3, false)).toEqual({ kind: "ok", value: 4 });
    expect(store.get(SP)).toMatchObject({ shortlisted: false, visited: true, visitedOn: Timestamp.fromDate(new Date("2026-05-03T00:00:00Z")), updatedBy: "ava-uid", version: 4 });
  });

  it("setVisited stores a UTC-midnight date; clearing drops visitedOn and keeps the shortlist", async () => {
    const store: Store = new Map([[RP, live]]);
    memoryTransactions(m.runTransaction, store);
    expect(await setVisited("home", "r1", AVA, 0, "2026-09-20")).toEqual({ kind: "ok", value: 1 });
    expect((store.get(SP)!.visitedOn as Timestamp).toDate().toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(store.get(SP)).toMatchObject({ shortlisted: false, visited: true });
    await setShortlisted("home", "r1", AVA, 1, true);
    expect(await setVisited("home", "r1", AVA, 2, null)).toEqual({ kind: "ok", value: 3 });
    expect(store.get(SP)).not.toHaveProperty("visitedOn");
    expect(store.get(SP)).toMatchObject({ shortlisted: true, visited: false, version: 3 });
  });

  it("reports conflict without writing when the stored version differs from the base", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [SP, stored]]);
    const tx = memoryTransactions(m.runTransaction, store);
    expect(await setShortlisted("home", "r1", AVA, 2, false)).toEqual({ kind: "conflict" });
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "conflict" });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("reports notFound for a missing restaurant or one marked deleting", async () => {
    memoryTransactions(m.runTransaction, new Map());
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "notFound" });
    memoryTransactions(m.runTransaction, new Map([[RP, { ...live, deleting: true }]]));
    expect(await setVisited("home", "r1", AVA, 0, "2026-09-20")).toEqual({ kind: "notFound" });
  });

  it("reports offline before starting a transaction when the browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "offline" });
    expect(m.runTransaction).not.toHaveBeenCalled();
  });
});

describe("watchers", () => {
  it("watchCollection maps documents by restaurant id and reports ready/offline", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_q: unknown, _o: unknown, next: (s: unknown) => void) => {
      next({ metadata: { fromCache: false }, docs: [{ id: "r1", data: () => stored }] });
      next({ metadata: { fromCache: true }, docs: [] });
      return () => {};
    });
    watchCollection("home", (s) => seen.push(s));
    expect(seen[0]).toEqual({ status: "ready", value: { r1: { shortlisted: true, visited: true, visitedOn: "2026-05-03", updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: new Date("2026-05-03T10:00:00Z"), version: 3 } } });
    expect(seen[1]).toEqual({ status: "offline", value: {} });
  });

  it("watchCollectionEntry reports null for a missing document, with the snapshot's source, and denied on permission errors", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_r: unknown, _o: unknown, next: (s: unknown) => void, fail: (e: unknown) => void) => {
      next({ metadata: { fromCache: false }, exists: () => false });
      next({ metadata: { fromCache: true }, exists: () => false });
      fail(Object.assign(new Error("denied"), { code: "permission-denied" }));
      return () => {};
    });
    watchCollectionEntry("home", "r1", (s) => seen.push(s));
    expect(seen).toEqual([{ status: "ready", value: null }, { status: "offline", value: null }, { status: "denied" }]);
    expect(m.onSnapshot.mock.calls[0]![1]).toEqual({ includeMetadataChanges: true });
  });
});
