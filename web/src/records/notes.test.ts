import { serverTimestamp, Timestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryTransactions, type Store } from "../test/memoryFirestore";

const m = vi.hoisted(() => ({ runTransaction: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn() }));

vi.mock("../firebase", () => ({ db: { fake: true } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  let generated = 0;
  return {
    ...actual,
    runTransaction: m.runTransaction,
    onSnapshot: m.onSnapshot,
    getDocsFromServer: vi.fn(),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (parent: unknown, ...segments: string[]) => {
      const base = typeof (parent as { path?: string }).path === "string" ? (parent as { path: string }).path : "";
      const id = segments.length > 0 ? segments[segments.length - 1]! : `gen-${++generated}`;
      const path = segments.length > 0 ? [base, ...segments].filter(Boolean).join("/") : `${base}/${id}`;
      return { id, path };
    },
    query: (source: unknown) => source,
    orderBy: m.orderBy,
    limit: () => undefined,
  };
});

import { addNote, deleteNote, updateNote, watchNotes } from "./notes";

const RP = "households/home/restaurants/r1";
const NP = `${RP}/notes/n1`;
const AVA = { uid: "ava-uid", displayName: "Ava" };
const live = { name: "Da Marco", address: "Via Roma 1", deleting: false, version: 2 };
const at = Timestamp.fromDate(new Date("2026-09-01T10:00:00Z"));
const note = { text: "Great staff", authorUid: "ava-uid", authorName: "Ava", createdAt: at, updatedAt: at, version: 2 };

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => vi.clearAllMocks());

describe("addNote", () => {
  it("writes version 1, the author's identity and server timestamps under a live restaurant", async () => {
    const store: Store = new Map([[RP, live]]);
    memoryTransactions(m.runTransaction, store);
    const outcome = await addNote("home", "r1", AVA, "Staff knew about cross-contamination.");
    expect(outcome.kind).toBe("ok");
    const id = (outcome as { value: string }).value;
    expect(store.get(`${RP}/notes/${id}`)).toEqual({
      text: "Staff knew about cross-contamination.",
      authorUid: "ava-uid",
      authorName: "Ava",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1,
    });
  });

  it("reports notFound under a missing restaurant or one marked deleting", async () => {
    memoryTransactions(m.runTransaction, new Map());
    expect((await addNote("home", "r1", AVA, "x")).kind).toBe("notFound");
    memoryTransactions(m.runTransaction, new Map([[RP, { ...live, deleting: true }]]));
    expect((await addNote("home", "r1", AVA, "x")).kind).toBe("notFound");
  });
});

describe("updateNote", () => {
  it("writes only text, updatedAt and the next version", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [NP, note]]);
    const tx = memoryTransactions(m.runTransaction, store);
    expect(await updateNote("home", "r1", "n1", 2, "Edited")).toEqual({ kind: "ok", value: 3 });
    expect(tx.update).toHaveBeenCalledWith({ id: "n1", path: NP }, { text: "Edited", updatedAt: serverTimestamp(), version: 3 });
  });

  it("reports conflict on a stale base and notFound for a missing note or a restaurant marked deleting", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [NP, note]]);
    const tx = memoryTransactions(m.runTransaction, store);
    expect(await updateNote("home", "r1", "n1", 1, "Edited")).toEqual({ kind: "conflict" });
    expect(await updateNote("home", "r1", "gone", 1, "Edited")).toEqual({ kind: "notFound" });
    store.set(RP, { ...live, deleting: true });
    expect(await updateNote("home", "r1", "n1", 2, "Edited")).toEqual({ kind: "notFound" });
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe("deleteNote", () => {
  it("deletes only the version the member confirmed", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [NP, note]]);
    memoryTransactions(m.runTransaction, store);
    expect(await deleteNote("home", "r1", "n1", 1)).toEqual({ kind: "conflict" });
    expect(store.has(NP)).toBe(true);
    expect(await deleteNote("home", "r1", "n1", 2)).toEqual({ kind: "ok", value: undefined });
    expect(store.has(NP)).toBe(false);
    expect(await deleteNote("home", "r1", "n1", 2)).toEqual({ kind: "notFound" });
  });
});

describe("watchNotes", () => {
  it("lists newest first and reports ready/offline", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_q: unknown, _o: unknown, next: (s: unknown) => void) => {
      next({ metadata: { fromCache: true }, docs: [{ id: "n1", data: () => note }] });
      return () => {};
    });
    watchNotes("home", "r1", (s) => seen.push(s));
    expect(m.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(seen[0]).toEqual({ status: "offline", value: [{ id: "n1", text: "Great staff", authorUid: "ava-uid", authorName: "Ava", createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-01T10:00:00Z"), version: 2 }] });
  });
});
