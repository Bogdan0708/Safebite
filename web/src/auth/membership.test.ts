import { describe, expect, it } from "vitest";
import { resolveMembership } from "./membership";

describe("resolveMembership", () => {
  const household = { name: "Home", memberIds: ["ava-uid", "bogdan-uid"] };

  it("is a member when the user doc names a household that lists the uid", () => {
    expect(resolveMembership("ava-uid", { householdId: "home", displayName: "Ava" }, household)).toEqual({
      kind: "member",
      householdId: "home",
      displayName: "Ava",
    });
  });

  it("is not a member when there is no user doc", () => {
    expect(resolveMembership("stranger-uid", undefined, undefined)).toEqual({ kind: "notMember" });
  });

  it("is not a member when the user doc has no householdId", () => {
    expect(resolveMembership("x", { displayName: "X" }, household)).toEqual({ kind: "notMember" });
  });

  it("is not a member when the household doc is missing", () => {
    expect(resolveMembership("ava-uid", { householdId: "home", displayName: "Ava" }, undefined)).toEqual({ kind: "notMember" });
  });

  it("is not a member when the household does not list the uid", () => {
    expect(resolveMembership("orphan", { householdId: "home", displayName: "O" }, household)).toEqual({ kind: "notMember" });
  });

  it("falls back to an empty displayName", () => {
    expect(resolveMembership("ava-uid", { householdId: "home" }, household)).toEqual({
      kind: "member",
      householdId: "home",
      displayName: "",
    });
  });
});
