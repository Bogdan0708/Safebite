import { describe, expect, it } from "vitest";
import { anyOffline, combineStates, isData } from "./combine";

describe("combineStates", () => {
  it("is loading until both listeners have produced a snapshot", () => {
    expect(combineStates({ status: "loading" }, { status: "ready", value: 1 })).toEqual({ status: "loading" });
    expect(combineStates({ status: "ready", value: 1 }, { status: "loading" })).toEqual({ status: "loading" });
  });

  it("never hides denied or an error behind other states, denied first", () => {
    expect(combineStates({ status: "error", message: "boom" }, { status: "denied" })).toEqual({ status: "denied" });
    expect(combineStates({ status: "offline", value: 1 }, { status: "error", message: "boom" })).toEqual({ status: "error", message: "boom" });
    expect(combineStates({ status: "loading" }, { status: "error", message: "boom" })).toEqual({ status: "error", message: "boom" });
  });

  it("is offline when either side is cache-backed, ready only when both are from the server", () => {
    expect(combineStates({ status: "offline", value: 1 }, { status: "ready", value: "a" })).toEqual({ status: "offline", value: [1, "a"] });
    expect(combineStates({ status: "ready", value: 1 }, { status: "ready", value: "a" })).toEqual({ status: "ready", value: [1, "a"] });
  });
});

describe("isData / anyOffline", () => {
  it("classify states", () => {
    expect(isData({ status: "offline", value: [] })).toBe(true);
    expect(isData({ status: "loading" })).toBe(false);
    expect(anyOffline({ status: "ready", value: 1 }, { status: "loading" })).toBe(false);
    expect(anyOffline({ status: "ready", value: 1 }, { status: "offline", value: 2 })).toBe(true);
  });
});
