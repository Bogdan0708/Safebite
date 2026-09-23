// The whole file runs in a far-from-UTC zone so any accidental local-time arithmetic shows up.
// Node re-reads TZ when process.env.TZ is assigned at runtime.
process.env.TZ = "Pacific/Auckland";

import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  addMonths,
  compareCalendarDates,
  formatCalendarDate,
  fromCalendarDate,
  isCalendarDate,
  localToday,
  msUntilNextLocalMidnight,
  toCalendarDate,
} from "./dates";

describe("test zone", () => {
  it("really runs in Pacific/Auckland (UTC+12/+13)", () => {
    expect([-720, -780]).toContain(new Date(2026, 0, 15).getTimezoneOffset());
  });
});

describe("isCalendarDate", () => {
  it("accepts real YYYY-MM-DD dates and rejects malformed or impossible ones", () => {
    expect(isCalendarDate("2026-09-21")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("21/09/2026")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});

describe("fromCalendarDate / toCalendarDate", () => {
  it("round-trips through a UTC-midnight timestamp regardless of the device zone", () => {
    const ts = fromCalendarDate("2026-09-21");
    expect(ts.toDate().toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(toCalendarDate(ts)).toBe("2026-09-21");
  });

  it("reads a Rome-midnight instant as the UTC calendar day it falls on (audit F3 reproduction)", () => {
    // 2026-09-21T00:00 in Rome (CEST) is 2026-09-20T22:00Z: that timestamp is NOT a canonical date;
    // the reader must report the UTC day, and the rules refuse to store such a value at all.
    const romeMidnight = Timestamp.fromDate(new Date("2026-09-20T22:00:00.000Z"));
    expect(toCalendarDate(romeMidnight)).toBe("2026-09-20");
  });
});

describe("localToday", () => {
  it("uses the device's local calendar day, not UTC", () => {
    // 00:30 local in Auckland on 21 Sept is still 20 Sept in UTC.
    expect(localToday(new Date(2026, 8, 21, 0, 30))).toBe("2026-09-21");
    expect(new Date(2026, 8, 21, 0, 30).toISOString().slice(0, 10)).toBe("2026-09-20");
  });
});

describe("addMonths", () => {
  it("adds twelve months keeping the day", () => {
    expect(addMonths("2025-09-21", 12)).toBe("2026-09-21");
  });
  it("clamps to the last day when the target month is shorter", () => {
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
  });
  it("carries across a year boundary", () => {
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("compareCalendarDates", () => {
  it("orders lexicographically, which is chronological for zero-padded dates", () => {
    expect(compareCalendarDates("2026-09-21", "2026-10-01")).toBeLessThan(0);
    expect(compareCalendarDates("2026-09-21", "2026-09-21")).toBe(0);
    expect(compareCalendarDates("2027-01-01", "2026-12-31")).toBeGreaterThan(0);
  });
});

describe("formatCalendarDate", () => {
  it("prints the UTC calendar date in British long form, independent of the device zone", () => {
    expect(formatCalendarDate("2026-09-21")).toBe("21 September 2026");
    expect(formatCalendarDate("2026-03-01")).toBe("1 March 2026");
  });
});

describe("msUntilNextLocalMidnight", () => {
  it("counts to the next local 00:00", () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 21, 23, 59, 0))).toBe(60_000);
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 21, 0, 0, 0))).toBe(24 * 60 * 60 * 1000);
  });
});
