import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETED_UIDS_KEY, deletedUids, forgetDeletedUid, isDeletedUid, recordDeletedUid } from "./deletedSessions";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe("deleted-session record", () => {
  it("records newest first, deduplicates, keeps at most 10, and writes both stores", () => {
    for (let i = 0; i < 12; i++) recordDeletedUid(`u${i}`);
    recordDeletedUid("u5");
    expect(deletedUids()).toHaveLength(10);
    expect(deletedUids()[0]).toBe("u5");
    expect(JSON.parse(localStorage.getItem(DELETED_UIDS_KEY)!)).toEqual(JSON.parse(sessionStorage.getItem(DELETED_UIDS_KEY)!));
    expect(isDeletedUid("u0")).toBe(false);
  });
  it("forgets a uid", () => {
    recordDeletedUid("ava-uid");
    forgetDeletedUid("ava-uid");
    expect(isDeletedUid("ava-uid")).toBe(false);
  });
  it("a stale sessionStorage mirror does not put a uid back into localStorage (G1)", () => {
    sessionStorage.setItem(DELETED_UIDS_KEY, JSON.stringify(["ava-uid"]));
    localStorage.setItem(DELETED_UIDS_KEY, JSON.stringify([]));
    recordDeletedUid("other");
    expect(JSON.parse(localStorage.getItem(DELETED_UIDS_KEY)!)).toEqual(["other"]);
    expect(JSON.parse(sessionStorage.getItem(DELETED_UIDS_KEY)!)).toEqual(["other", "ava-uid"]);
  });
  it("forgetting rebuilds each store from its own list (G1)", () => {
    sessionStorage.setItem(DELETED_UIDS_KEY, JSON.stringify(["ava-uid", "s-only"]));
    localStorage.setItem(DELETED_UIDS_KEY, JSON.stringify(["l-only", "ava-uid"]));
    forgetDeletedUid("ava-uid");
    expect(JSON.parse(localStorage.getItem(DELETED_UIDS_KEY)!)).toEqual(["l-only"]);
    expect(JSON.parse(sessionStorage.getItem(DELETED_UIDS_KEY)!)).toEqual(["s-only"]);
  });
  it("reads the union, so a tab whose localStorage is blocked still knows", () => {
    sessionStorage.setItem(DELETED_UIDS_KEY, JSON.stringify(["ava-uid"]));
    localStorage.setItem(DELETED_UIDS_KEY, JSON.stringify(["other"]));
    expect(new Set(deletedUids())).toEqual(new Set(["ava-uid", "other"]));
  });
  it("ignores malformed values and never throws when storage is blocked (Review Focus 4)", () => {
    localStorage.setItem(DELETED_UIDS_KEY, "{not json");
    sessionStorage.setItem(DELETED_UIDS_KEY, JSON.stringify([1, "", "ok"]));
    expect(deletedUids()).toEqual(["ok"]);
    for (const m of ["getItem", "setItem"] as const) vi.spyOn(Storage.prototype, m).mockImplementation(() => { throw new Error("blocked"); });
    expect(() => recordDeletedUid("x")).not.toThrow();
    expect(deletedUids()).toEqual([]);
  });
});
