import { describe, expect, it } from "vitest";
import { filterRows, joinRecords } from "./join";
import type { CollectionState, Restaurant } from "./types";

const r = (id: string, deleting = false): Restaurant => ({ id, name: id, address: "x", createdBy: "ava-uid", createdAt: new Date(0), updatedAt: new Date(0), version: 1, deleting });
const s = (shortlisted: boolean): CollectionState => ({ shortlisted, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: new Date(0), version: 1 });

describe("joinRecords / filterRows", () => {
  it("pairs each restaurant with its state by id, null when absent", () => {
    const rows = joinRecords([r("a"), r("b")], { a: s(true) });
    expect(rows).toEqual([{ restaurant: r("a"), state: s(true) }, { restaurant: r("b"), state: null }]);
  });

  it("the shortlist keeps shortlisted rows and every deleting row; all keeps everything", () => {
    const rows = joinRecords([r("a"), r("b"), r("c"), r("d", true)], { a: s(true), b: s(false) });
    expect(filterRows(rows, "shortlist").map((x) => x.restaurant.id)).toEqual(["a", "d"]);
    expect(filterRows(rows, "all").map((x) => x.restaurant.id)).toEqual(["a", "b", "c", "d"]);
  });
});
