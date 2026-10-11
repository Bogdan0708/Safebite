import { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getDocs: vi.fn(), getDoc: vi.fn() }));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    query: (source: { path: string }) => source,
    orderBy: () => undefined,
    getDocsFromServer: (q: { path: string }) => m.getDocs(q.path),
    getDocFromServer: (r: { path: string }) => m.getDoc(r.path),
  };
});

import { RefreshDenied, RefreshOffline, readHouseholdFromServer, readRestaurantFromServer } from "./serverReads";

const ts = Timestamp.fromMillis(Date.UTC(2026, 8, 1));
const restaurantDoc = (id: string, name: string) => ({ id, data: () => ({ name, address: "1 St", createdBy: "ava-uid", createdAt: ts, updatedAt: ts, version: 1, deleting: false }) });
const claimDoc = (id: string) => ({ id, data: () => ({ kind: "gfMenu", value: "yes", detail: "", source: { type: "restaurantStatement", label: "Phone" }, checkedAt: ts, authorUid: "ava-uid", authorName: "Ava", createdAt: ts }) });
const noteDoc = (id: string, at: number) => ({ id, data: () => ({ text: id, authorUid: "ava-uid", authorName: "Ava", createdAt: Timestamp.fromMillis(at), updatedAt: Timestamp.fromMillis(at), version: 1 }) });
const query = (docs: unknown[], fromCache = false) => ({ docs, empty: docs.length === 0, metadata: { fromCache } });

beforeEach(() => { m.getDocs.mockReset(); m.getDoc.mockReset(); });

function household() {
  m.getDocs.mockImplementation(async (path: string) => {
    if (path === "households/home/restaurants") return query([restaurantDoc("a", "Bistro"), restaurantDoc("b", "Zest")]);
    if (path === "households/home/restaurants/a/claims") return query([claimDoc("c1")]);
    if (path === "households/home/restaurants/a/notes") return query([noteDoc("new", 2), noteDoc("old", 1)]);
    if (path === "households/home/collection") return query([{ id: "a", data: () => ({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: ts, version: 1 }) }]);
    return query([]);
  });
}

describe("readHouseholdFromServer", () => {
  it("reads every collection from the server into a copy, keeping query order, and counts reads", async () => {
    household();
    const { data, stats } = await readHouseholdFromServer("home");
    expect(data.restaurants.map((r) => r.name)).toEqual(["Bistro", "Zest"]);
    expect(data.claims.a!.map((c) => c.id)).toEqual(["c1"]);
    expect(data.claims.b).toEqual([]);
    expect(data.notes.a!.map((n) => n.id)).toEqual(["new", "old"]);
    expect(data.collection.a!.shortlisted).toBe(true);
    expect(stats).toEqual({ queries: 6, documents: 6, emptyQueries: 2 });
  });

  it("refuses a snapshot served from cache (review P1-1)", async () => {
    household();
    m.getDocs.mockImplementationOnce(async () => query([restaurantDoc("a", "Bistro")], true));
    await expect(readHouseholdFromServer("home")).rejects.toBeInstanceOf(RefreshOffline);
  });

  it("maps unavailable to offline and permission-denied to denied", async () => {
    m.getDocs.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "unavailable" }));
    await expect(readHouseholdFromServer("home")).rejects.toBeInstanceOf(RefreshOffline);
    m.getDocs.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "permission-denied" }));
    await expect(readHouseholdFromServer("home")).rejects.toBeInstanceOf(RefreshDenied);
  });
});

describe("readRestaurantFromServer", () => {
  it("reads one restaurant with its claims, notes and state", async () => {
    household();
    m.getDoc.mockImplementation(async (path: string) => (path === "households/home/restaurants/a"
      ? { ...restaurantDoc("a", "Bistro"), exists: () => true, metadata: { fromCache: false } }
      : { id: "a", exists: () => false, data: () => undefined, metadata: { fromCache: false } }));
    const { data } = await readRestaurantFromServer("home", "a");
    expect(data!.restaurant.name).toBe("Bistro");
    expect(data!.claims).toHaveLength(1);
    expect(data!.notes.map((n) => n.id)).toEqual(["new", "old"]);
    expect(data!.state).toBeNull();
  });

  it("a restaurant gone from the server reads as null", async () => {
    m.getDoc.mockResolvedValue({ id: "a", exists: () => false, data: () => undefined, metadata: { fromCache: false } });
    await expect(readRestaurantFromServer("home", "a")).resolves.toMatchObject({ data: null });
  });
});
