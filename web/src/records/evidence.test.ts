import { describe, expect, it } from "vitest";
import { evidenceStatus, sortClaims, summariseEvidence } from "./evidence";
import type { Claim } from "./types";

function claim(over: Partial<Claim> & Pick<Claim, "id">): Claim {
  return {
    kind: "separateFryer",
    value: "yes",
    detail: "",
    source: { type: "restaurantStatement", label: "Phone call" },
    checkedAt: "2026-09-21",
    authorUid: "ava-uid",
    authorName: "Ava",
    createdAt: new Date("2026-09-21T10:00:00Z"),
    ...over,
  };
}

describe("evidenceStatus — default 12-month anniversary", () => {
  const c = { checkedAt: "2025-09-21" };
  it("is current the day before the anniversary", () => expect(evidenceStatus(c, "2026-09-20")).toBe("current"));
  it("needs rechecking on the anniversary day", () => expect(evidenceStatus(c, "2026-09-21")).toBe("needsRechecking"));
  it("needs rechecking after the anniversary", () => expect(evidenceStatus(c, "2026-09-22")).toBe("needsRechecking"));
  it("clamps a leap-day anniversary to 28 February", () => {
    expect(evidenceStatus({ checkedAt: "2028-02-29" }, "2029-02-27")).toBe("current");
    expect(evidenceStatus({ checkedAt: "2028-02-29" }, "2029-02-28")).toBe("needsRechecking");
  });
});

describe("evidenceStatus — explicit expiresAt", () => {
  const c = { checkedAt: "2026-01-10", expiresAt: "2026-09-30" };
  it("is current on the expiry day itself", () => expect(evidenceStatus(c, "2026-09-30")).toBe("current"));
  it("needs rechecking the day after expiry", () => expect(evidenceStatus(c, "2026-10-01")).toBe("needsRechecking"));
  it("takes precedence over the anniversary in both directions", () => {
    expect(evidenceStatus({ checkedAt: "2020-01-01", expiresAt: "2099-01-01" }, "2026-09-21")).toBe("current");
    expect(evidenceStatus({ checkedAt: "2026-09-01", expiresAt: "2026-09-10" }, "2026-09-21")).toBe("needsRechecking");
  });
});

describe("sortClaims", () => {
  it("orders by checkedAt desc, then createdAt desc, then id asc", () => {
    const sorted = sortClaims([
      claim({ id: "b", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T09:00:00Z") }),
      claim({ id: "a", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T09:00:00Z") }),
      claim({ id: "c", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T12:00:00Z") }),
      claim({ id: "d", checkedAt: "2026-09-15" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["d", "c", "a", "b"]);
  });
});

describe("summariseEvidence", () => {
  const today = "2026-09-21";

  it("returns one entry per kind in CLAIM_KINDS order, unknown when there is no claim", () => {
    const summary = summariseEvidence([], today);
    expect(summary.map((s) => s.kind)).toEqual(["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"]);
    expect(summary.every((s) => s.state === "unknown")).toBe(true);
  });

  it("the newest claim is current and older ones are history", () => {
    const summary = summariseEvidence([claim({ id: "old", checkedAt: "2025-01-01", value: "no" }), claim({ id: "new", checkedAt: "2026-09-01", value: "yes" })], today);
    const fryer = summary.find((s) => s.kind === "separateFryer")!;
    expect(fryer.state).toBe("current");
    if (fryer.state === "current") {
      expect(fryer.latest.id).toBe("new");
      expect(fryer.history.map((c) => c.id)).toEqual(["old"]);
    }
  });

  it("an expired newest claim is needsRechecking, not hidden", () => {
    const summary = summariseEvidence([claim({ id: "stale", checkedAt: "2025-06-01" })], today);
    expect(summary.find((s) => s.kind === "separateFryer")!.state).toBe("needsRechecking");
  });

  it("same-day claims that disagree are conflicting, with equal prominence", () => {
    const summary = summariseEvidence(
      [
        claim({ id: "yes", checkedAt: "2026-09-01", value: "yes", source: { type: "restaurantStatement", label: "Waiter" } }),
        claim({ id: "no", checkedAt: "2026-09-01", value: "no", source: { type: "ownVisit", label: "Saw shared fryer" } }),
        claim({ id: "older", checkedAt: "2026-01-01", value: "yes" }),
      ],
      today,
    );
    const fryer = summary.find((s) => s.kind === "separateFryer")!;
    expect(fryer.state).toBe("conflicting");
    if (fryer.state === "conflicting") {
      expect(fryer.tied.map((c) => c.id).sort()).toEqual(["no", "yes"]);
      expect(fryer.history.map((c) => c.id)).toEqual(["older"]);
    }
  });

  it("same-day claims that agree are simply current with the later-created one as latest", () => {
    const summary = summariseEvidence(
      [
        claim({ id: "first", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T09:00:00Z") }),
        claim({ id: "second", checkedAt: "2026-09-01", createdAt: new Date("2026-09-01T10:00:00Z") }),
      ],
      today,
    );
    const fryer = summary.find((s) => s.kind === "separateFryer")!;
    expect(fryer.state).toBe("current");
    if (fryer.state === "current") expect(fryer.latest.id).toBe("second");
  });
});
