import { Timestamp, deleteField, serverTimestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(),
  getDocsFromServer: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: { fake: true } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  let generated = 0;
  return {
    ...actual,
    runTransaction: m.runTransaction,
    onSnapshot: m.onSnapshot,
    getDocsFromServer: m.getDocsFromServer,
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (parent: unknown, ...segments: string[]) => {
      const base = typeof (parent as { path?: string }).path === "string" ? (parent as { path: string }).path : "";
      const id = segments.length > 0 ? segments[segments.length - 1]! : `gen-${++generated}`;
      const path = segments.length > 0 ? [base, ...segments].filter(Boolean).join("/") : `${base}/${id}`;
      return { id, path };
    },
    query: (source: unknown) => source,
    orderBy: () => undefined,
    limit: () => undefined,
  };
});

import {
  addClaim,
  createRestaurant,
  deleteRestaurant,
  markDeleting,
  sweepClaims,
  toClaim,
  toRestaurant,
  updateRestaurant,
  watchRestaurant,
  watchRestaurants,
} from "./repository";

function fakeTx(getResult: { exists: boolean; data?: Record<string, unknown> }) {
  const tx = {
    get: vi.fn(async (ref: { id: string }) => ({ id: ref.id, ref, exists: () => getResult.exists, data: () => getResult.data })),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  m.runTransaction.mockImplementation(async (_db: unknown, run: (t: typeof tx) => Promise<unknown>) => run(tx));
  return tx;
}

const storedRestaurant = {
  name: "Da Marco",
  address: "Via Roma 1",
  createdBy: "ava-uid",
  createdAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
  updatedAt: Timestamp.fromDate(new Date("2026-09-02T10:00:00Z")),
  version: 3,
  deleting: false,
};

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("parsing", () => {
  it("toRestaurant keeps optional fields only when present and converts timestamps", () => {
    const snap = { id: "r1", exists: () => true, data: () => ({ ...storedRestaurant, phone: "+39", lat: 41.9, lng: 12.5 }) };
    const r = toRestaurant(snap as never);
    expect(r).toMatchObject({ id: "r1", name: "Da Marco", phone: "+39", lat: 41.9, lng: 12.5, version: 3, deleting: false });
    expect(r.createdAt.toISOString()).toBe("2026-09-01T10:00:00.000Z");
    expect("website" in r).toBe(false);
  });

  it("toClaim converts UTC-midnight timestamps to calendar dates and omits an absent expiresAt", () => {
    const snap = {
      id: "c1",
      exists: () => true,
      data: () => ({
        kind: "separateFryer",
        value: "yes",
        detail: "",
        source: { type: "ownVisit", label: "Visit" },
        checkedAt: Timestamp.fromDate(new Date("2026-09-20T00:00:00Z")),
        authorUid: "ava-uid",
        authorName: "Ava",
        createdAt: Timestamp.fromDate(new Date("2026-09-20T09:00:00Z")),
      }),
    };
    const c = toClaim(snap as never);
    expect(c.checkedAt).toBe("2026-09-20");
    expect("expiresAt" in c).toBe(false);
    expect(c.createdAt.toISOString()).toBe("2026-09-20T09:00:00.000Z");
  });
});

describe("createRestaurant", () => {
  it("writes version 1, deleting false, the caller as createdBy and server timestamps in one transaction", async () => {
    const tx = fakeTx({ exists: false });
    const outcome = await createRestaurant("home", "ava-uid", { name: "Da Marco", address: "Via Roma 1", website: "https://damarco.it" });
    expect(outcome).toEqual({ kind: "ok", value: expect.stringMatching(/^gen-/) });
    expect(tx.set).toHaveBeenCalledTimes(1);
    const data = tx.set.mock.calls[0]![1] as Record<string, unknown>;
    expect(data).toMatchObject({ name: "Da Marco", address: "Via Roma 1", website: "https://damarco.it", createdBy: "ava-uid", version: 1, deleting: false });
    expect(data.createdAt).toEqual(serverTimestamp());
    expect(data.updatedAt).toEqual(serverTimestamp());
    expect("phone" in data).toBe(false);
  });
});

describe("updateRestaurant", () => {
  it("bumps to baseVersion + 1 and clears dropped optionals with deleteField", async () => {
    const tx = fakeTx({ exists: true, data: { ...storedRestaurant, phone: "+39" } });
    const outcome = await updateRestaurant("home", "r1", 3, { name: "Renamed", address: "Via Roma 1" });
    expect(outcome).toEqual({ kind: "ok", value: 4 });
    const patch = tx.update.mock.calls[0]![1] as Record<string, unknown>;
    expect(patch).toMatchObject({ name: "Renamed", address: "Via Roma 1", version: 4 });
    expect(patch.phone).toEqual(deleteField());
    expect(patch.website).toEqual(deleteField());
    expect(patch.updatedAt).toEqual(serverTimestamp());
    expect("lat" in patch).toBe(false);
  });

  it("reports conflict when the stored version differs from the base version, without writing", async () => {
    const tx = fakeTx({ exists: true, data: { ...storedRestaurant, version: 4 } });
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "conflict" });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("reports notFound for a missing or deleting restaurant", async () => {
    fakeTx({ exists: false });
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "notFound" });
    fakeTx({ exists: true, data: { ...storedRestaurant, deleting: true } });
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "notFound" });
  });
});

describe("outcome classification", () => {
  it("permission-denied → permission; unavailable → offline; anything else → failed with the message", async () => {
    m.runTransaction.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "permission" });
    m.runTransaction.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }));
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "offline" });
    m.runTransaction.mockRejectedValueOnce(new Error("boom"));
    expect(await updateRestaurant("home", "r1", 3, { name: "x", address: "y" })).toEqual({ kind: "failed", message: "boom" });
  });

  it("reports offline before starting a transaction when the browser says it is offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await createRestaurant("home", "ava-uid", { name: "x", address: "y" })).toEqual({ kind: "offline" });
    expect(m.runTransaction).not.toHaveBeenCalled();
  });
});

describe("deletion protocol", () => {
  it("markDeleting bumps the version and sets deleting; conflicts on a stale base; is idempotent when already marked", async () => {
    const tx = fakeTx({ exists: true, data: storedRestaurant });
    expect(await markDeleting("home", "r1", 3)).toEqual({ kind: "ok", value: 4 });
    expect(tx.update.mock.calls[0]![1]).toMatchObject({ deleting: true, version: 4 });
    fakeTx({ exists: true, data: storedRestaurant });
    expect(await markDeleting("home", "r1", 2)).toEqual({ kind: "conflict" });
    const tx3 = fakeTx({ exists: true, data: { ...storedRestaurant, deleting: true } });
    expect(await markDeleting("home", "r1", 99)).toEqual({ kind: "ok", value: 3 });
    expect(tx3.update).not.toHaveBeenCalled();
  });

  it("sweepClaims deletes server-read pages until empty and reports the count", async () => {
    const tx = fakeTx({ exists: true });
    m.getDocsFromServer
      .mockResolvedValueOnce({ size: 2, empty: false, docs: [{ ref: { id: "a" } }, { ref: { id: "b" } }] })
      .mockResolvedValueOnce({ size: 0, empty: true, docs: [] });
    expect(await sweepClaims("home", "r1")).toEqual({ kind: "ok", value: 2 });
    expect(tx.delete).toHaveBeenCalledTimes(2);
    expect(m.getDocsFromServer).toHaveBeenCalledTimes(2);
  });

  it("deleteRestaurant runs mark → sweep → remove and reports progress; stops at the first non-ok outcome", async () => {
    const steps: string[] = [];
    const tx = fakeTx({ exists: true, data: storedRestaurant });
    m.getDocsFromServer.mockResolvedValue({ size: 0, empty: true, docs: [] });
    expect(await deleteRestaurant("home", "r1", 3, (s) => steps.push(s))).toEqual({ kind: "ok", value: undefined });
    expect(steps).toEqual(["marking", "sweeping", "removing"]);
    expect(tx.delete).toHaveBeenCalledTimes(1); // the restaurant document

    const stopped: string[] = [];
    fakeTx({ exists: true, data: { ...storedRestaurant, version: 9 } });
    expect(await deleteRestaurant("home", "r1", 3, (s) => stopped.push(s))).toEqual({ kind: "conflict" });
    expect(stopped).toEqual(["marking"]);
  });
});

describe("addClaim", () => {
  it("stores UTC-midnight timestamps, the author's identity and a server createdAt; notFound under a deleting parent", async () => {
    const tx = fakeTx({ exists: true, data: storedRestaurant });
    const outcome = await addClaim("home", "r1", { uid: "ava-uid", displayName: "Ava" }, {
      kind: "accreditation",
      value: "yes",
      detail: "",
      source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/x" },
      checkedAt: "2026-09-20",
      expiresAt: "2027-09-20",
    });
    expect(outcome.kind).toBe("ok");
    const data = tx.set.mock.calls[0]![1] as Record<string, unknown>;
    expect((data.checkedAt as Timestamp).toDate().toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect((data.expiresAt as Timestamp).toDate().toISOString()).toBe("2027-09-20T00:00:00.000Z");
    expect(data).toMatchObject({ authorUid: "ava-uid", authorName: "Ava", source: { type: "accreditingBody", label: "Coeliac UK", url: "https://coeliac.org.uk/x" } });
    expect(data.createdAt).toEqual(serverTimestamp());

    fakeTx({ exists: true, data: { ...storedRestaurant, deleting: true } });
    expect((await addClaim("home", "r1", { uid: "ava-uid", displayName: "Ava" }, { kind: "gfMenu", value: "yes", detail: "", source: { type: "ownVisit", label: "x" }, checkedAt: "2026-09-20" })).kind).toBe("notFound");
  });
});

describe("watchers", () => {
  function emit(onNext: (s: unknown) => void, snapshot: unknown) {
    onNext(snapshot);
  }

  it("watchRestaurants reports ready from the server, offline from the cache, denied on permission errors", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_q: unknown, _opts: unknown, onNext: (s: unknown) => void, onError: (e: unknown) => void) => {
      emit(onNext, { metadata: { fromCache: false }, docs: [{ id: "r1", exists: () => true, data: () => storedRestaurant }] });
      emit(onNext, { metadata: { fromCache: true }, docs: [] });
      onError(Object.assign(new Error("denied"), { code: "permission-denied" }));
      return () => {};
    });
    watchRestaurants("home", (s) => seen.push(s));
    expect(seen[0]).toMatchObject({ status: "ready", value: [{ id: "r1", name: "Da Marco" }] });
    expect(seen[1]).toMatchObject({ status: "offline", value: [] });
    expect(seen[2]).toEqual({ status: "denied" });
  });

  it("watchRestaurant reports gone only for an authoritative miss, and an error for a cached miss", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_r: unknown, _opts: unknown, onNext: (s: unknown) => void) => {
      emit(onNext, { id: "r1", metadata: { fromCache: false }, exists: () => false });
      emit(onNext, { id: "r1", metadata: { fromCache: true }, exists: () => false });
      return () => {};
    });
    watchRestaurant("home", "r1", (s) => seen.push(s));
    expect(seen[0]).toEqual({ status: "gone" });
    expect(seen[1]).toMatchObject({ status: "error" });
  });

  it("passes includeMetadataChanges so cache → server transitions are reported", () => {
    m.onSnapshot.mockImplementation(() => () => {});
    watchRestaurants("home", () => {});
    expect(m.onSnapshot.mock.calls[0]![1]).toEqual({ includeMetadataChanges: true });
  });
});
