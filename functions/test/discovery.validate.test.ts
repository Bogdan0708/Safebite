import { describe, expect, it } from "vitest";
import { parseDestinationInput, parseNearbyInput } from "../src/discovery/validate";

describe("parseDestinationInput", () => {
  it("trims the query", () => {
    expect(parseDestinationInput({ query: "  Lisbon  " })).toEqual({ query: "Lisbon", mode: "venue" });
  });

  it("ignores unknown keys (identity never comes from data)", () => {
    expect(parseDestinationInput({ query: "Porto", uid: "ava-uid", householdId: "home" })).toEqual({ query: "Porto", mode: "venue" });
  });

  it.each(["destination", "venue"])("accepts explicit %s mode", (mode) => {
    expect(parseDestinationInput({ query: "  Porto  ", mode })).toEqual({ query: "Porto", mode });
  });

  it.each([
    ["not an object", "Porto"],
    ["null", null],
    ["missing query", {}],
    ["non-string query", { query: 42 }],
    ["blank query", { query: "   " }],
    ["too long", { query: "x".repeat(121) }],
    ["unknown mode", { query: "Porto", mode: "nearby" }],
    ["null mode", { query: "Porto", mode: null }],
    ["non-string mode", { query: "Porto", mode: 1 }],
    ["empty mode", { query: "Porto", mode: "" }],
  ])("rejects %s with invalid-argument", (_label, data) => {
    expect(() => parseDestinationInput(data)).toThrowError(expect.objectContaining({ code: "invalid-argument" }));
  });

  it("accepts a query of exactly 120 characters after trimming", () => {
    expect(parseDestinationInput({ query: ` ${"y".repeat(120)} ` }).query).toHaveLength(120);
  });
});

describe("parseNearbyInput", () => {
  it("returns the coordinates", () => {
    expect(parseNearbyInput({ lat: 51.5, lng: -0.12 })).toEqual({ lat: 51.5, lng: -0.12 });
  });

  it.each([
    ["missing lng", { lat: 1 }],
    ["string lat", { lat: "51.5", lng: 0 }],
    ["NaN", { lat: Number.NaN, lng: 0 }],
    ["lat over 90", { lat: 90.1, lng: 0 }],
    ["lat under -90", { lat: -90.1, lng: 0 }],
    ["lng over 180", { lat: 0, lng: 180.1 }],
    ["lng under -180", { lat: 0, lng: -180.1 }],
    ["not an object", [51.5, 0]],
  ])("rejects %s with invalid-argument", (_label, data) => {
    expect(() => parseNearbyInput(data)).toThrowError(expect.objectContaining({ code: "invalid-argument" }));
  });

  it("accepts the boundaries", () => {
    expect(parseNearbyInput({ lat: 90, lng: -180 })).toEqual({ lat: 90, lng: -180 });
    expect(parseNearbyInput({ lat: -90, lng: 180 })).toEqual({ lat: -90, lng: 180 });
  });
});
