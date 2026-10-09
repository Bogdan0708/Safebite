import { afterEach, describe, expect, it, vi } from "vitest";
const remove = vi.hoisted(() => vi.fn());
vi.mock("./persistedSession", () => ({ removePersistedUsersIfUids: remove }));
import { prepareAuthPersistence, persistentAuthAllowed } from "./authPersistence";
import { guardAuthSession, forgetAuthGuard, guardedAuthUids } from "./authCleanupGuard";
import { writeDeletionRequest } from "./storage";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); remove.mockReset(); });

describe("Auth startup cleanup gate", () => {
  it("cannot enable shared persistence until every guarded UID has finished cleanup", async () => {
    vi.stubGlobal("indexedDB", {});
    guardAuthSession("deleted");
    let release!: (value: string) => void;
    remove.mockImplementation(() => new Promise<string>(r => { release = r; }));
    const preparing = prepareAuthPersistence();
    expect(persistentAuthAllowed()).toBe(false);
    release("removed");
    await preparing;
    expect(persistentAuthAllowed()).toBe(true);
    expect(guardedAuthUids()).toEqual([]); // only retire after confirmed cleanup has committed
  });
  it("unavailable batch cleanup selects memory and retains every guard", async () => {
    vi.stubGlobal("indexedDB", {});
    guardAuthSession("first"); guardAuthSession("second");
    remove.mockResolvedValueOnce("unavailable");
    await prepareAuthPersistence();
    expect(persistentAuthAllowed()).toBe(false);
    expect(new Set(guardedAuthUids())).toEqual(new Set(["first", "second"]));
    remove.mockResolvedValue("notOurs");
    await prepareAuthPersistence();
    expect(persistentAuthAllowed()).toBe(true);
  });
  it("cleans a large history in one batch, retires both confirmed keys and keeps uncertain/new intents", async () => {
    vi.stubGlobal("indexedDB", {});
    const expected = new Set<string>(["uncertain"]);
    for (let i = 0; i < 100; i++) {
      const uid = `deleted-${i}`;
      guardAuthSession(uid, "request"); guardAuthSession(uid);
      expected.add(uid);
    }
    guardAuthSession("uncertain", "pending");
    let release!: (value: string) => void;
    remove.mockImplementation(() => new Promise<string>(r => { release = r; }));
    const preparing = prepareAuthPersistence();
    expect(guardedAuthUids()).toHaveLength(201); // retirement cannot precede completion
    guardAuthSession("deleted-0", "new-request"); // another request arrives during the await
    release("notOurs");
    await preparing;
    expect(remove).toHaveBeenCalledExactlyOnceWith(expected);
    expect(new Set(guardedAuthUids())).toEqual(new Set(["uncertain", "deleted-0"]));
    expect(localStorage.getItem("safebite.authCleanup.deleted-0:new-request")).toBe("1");
  });

  it("an older pending request is guarded without claiming its account was deleted", async () => {
    vi.stubGlobal("indexedDB", {});
    writeDeletionRequest({ requestId: "r".repeat(43), uid: "pending" });
    remove.mockResolvedValue("removed");
    await prepareAuthPersistence();
    expect(remove).toHaveBeenCalledWith(new Set(["pending"]));
    expect(localStorage.getItem("safebite.deletedUids")).toBeNull();
  });
  it.each(["missing IndexedDB", "blocked shared storage"])("uses memory with %s", async (reason) => {
    vi.stubGlobal("indexedDB", reason === "missing IndexedDB" ? undefined : {});
    if (reason === "blocked shared storage") vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await prepareAuthPersistence();
    expect(persistentAuthAllowed()).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
  it("a refused request cannot remove another tab's pending intent for the same UID", () => {
    guardAuthSession("same:uid", "request-one");
    guardAuthSession("same:uid", "request-two");
    forgetAuthGuard("same:uid", "request-one");
    expect(guardedAuthUids()).toEqual(["same:uid"]);
  });
  it("removing a preceding key during enumeration cannot skip the surviving guard", () => {
    guardAuthSession("first"); guardAuthSession("survivor");
    const keyAt = Storage.prototype.key;
    const read = Storage.prototype.getItem;
    // Exercise either enumeration strategy: old numeric indices skip survivor, a name
    // snapshot still checks it. This models another tab completing an unrelated sign-in.
    const removeFirst = () => localStorage.removeItem("safebite.authCleanup.first:confirmed");
    vi.spyOn(Storage.prototype, "key").mockImplementation(function (this: Storage, index) {
      const key = keyAt.call(this, index);
      removeFirst();
      return key;
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      const value = read.call(this, key);
      removeFirst();
      return value;
    });
    expect(guardedAuthUids()).toContain("survivor");
  });
  it("guarding and forgetting one UID never removes another account's guard", () => {
    expect(guardAuthSession("one")).toBe(true);
    expect(guardAuthSession("two")).toBe(true);
    forgetAuthGuard("one");
    expect(guardedAuthUids()).toEqual(["two"]);
  });
});
