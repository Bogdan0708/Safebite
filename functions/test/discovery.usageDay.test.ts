import { describe, expect, it } from "vitest";
import { usageDayKey } from "../src/discovery/usageDay";

describe("usageDayKey", () => {
  it("formats the UTC calendar day as yyyymmdd with zero padding", () => {
    expect(usageDayKey(new Date("2026-01-05T12:00:00Z"))).toBe("20260105");
  });

  // Bracket the boundary, never test the exact instant (Plan 2b lesson).
  it("uses the UTC day, not the local one", () => {
    expect(usageDayKey(new Date("2026-09-22T23:30:00Z"))).toBe("20260922");
    expect(usageDayKey(new Date("2026-09-23T00:30:00Z"))).toBe("20260923");
  });
});
