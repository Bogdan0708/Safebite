import { describe, expect, it } from "vitest";
import { copyIsOld, copyUsable } from "./eligibility";
import { CLOCK_TOLERANCE_MS, COPY_MAX_AGE_MS, STALE_BANNER_MS, type CopyMeta } from "./types";

const NOW = Date.UTC(2026, 9, 10);
const ID = { uid: "ava-uid", householdId: "home" };
const meta = (checkedAgo: number, downloadedAgo = checkedAgo): CopyMeta => ({
  uid: "ava-uid", householdId: "home", displayName: "Ava", revision: 1,
  downloadedAt: NOW - downloadedAgo, membershipCheckedAt: NOW - checkedAgo, complete: true,
});

describe("copyUsable", () => {
  it("accepts a matching, opted-in copy checked within 30 days (inclusive)", () => {
    expect(copyUsable(meta(0), ID, true, false, NOW)).toBe(true);
    expect(copyUsable(meta(COPY_MAX_AGE_MS), ID, true, false, NOW)).toBe(true);
  });
  it("refuses just past 30 days", () => {
    expect(copyUsable(meta(COPY_MAX_AGE_MS + 1), ID, true, false, NOW)).toBe("expired");
  });
  it("refuses a membership check more than 5 minutes in the future, or a clock set back further (Review Focus 5)", () => {
    expect(copyUsable(meta(-CLOCK_TOLERANCE_MS - 1), ID, true, false, NOW)).toBe("expired");
    expect(copyUsable(meta(0), ID, true, false, NOW - CLOCK_TOLERANCE_MS - 1)).toBe("expired");
    expect(copyUsable(meta(-COPY_MAX_AGE_MS), ID, true, false, NOW)).toBe("expired");
  });
  it("treats a check up to 5 minutes in the future as age 0 (owner follow-up 2026-10-11)", () => {
    expect(CLOCK_TOLERANCE_MS).toBe(5 * 60 * 1000);
    expect(copyUsable(meta(-1), ID, true, false, NOW)).toBe(true);
    expect(copyUsable(meta(-CLOCK_TOLERANCE_MS), ID, true, false, NOW)).toBe(true);
    expect(copyUsable(meta(0), ID, true, false, NOW - CLOCK_TOLERANCE_MS)).toBe(true);
  });
  it("the tolerance never extends the 30-day expiry", () => {
    expect(copyUsable(meta(COPY_MAX_AGE_MS), ID, true, false, NOW)).toBe(true);
    expect(copyUsable(meta(COPY_MAX_AGE_MS + 1), ID, true, false, NOW)).toBe("expired");
    expect(copyUsable(meta(COPY_MAX_AGE_MS + CLOCK_TOLERANCE_MS), ID, true, false, NOW)).toBe("expired");
  });
  it("refuses another account or household, an opt-out, a pending clear and a missing copy", () => {
    expect(copyUsable(meta(0), { uid: "bogdan-uid", householdId: "home" }, true, false, NOW)).toBe("otherCopy");
    expect(copyUsable(meta(0), { uid: "ava-uid", householdId: "elsewhere" }, true, false, NOW)).toBe("otherCopy");
    expect(copyUsable(meta(0), ID, false, false, NOW)).toBe("optedOut");
    expect(copyUsable(meta(0), ID, true, true, NOW)).toBe("pendingClear");
    expect(copyUsable(null, ID, true, false, NOW)).toBe("none");
  });
});

describe("copyUsable fails closed (final review M3)", () => {
  it("a non-finite membership check or clock is expired, never usable", () => {
    expect(copyUsable({ ...meta(0), membershipCheckedAt: NaN }, ID, true, false, NOW)).toBe("expired");
    expect(copyUsable({ ...meta(0), membershipCheckedAt: -Infinity }, ID, true, false, NOW)).toBe("expired");
    expect(copyUsable(meta(0), ID, true, false, NaN)).toBe("expired");
  });
});

describe("copyIsOld", () => {
  it("is old only beyond exactly 7 days", () => {
    expect(copyIsOld(meta(0, STALE_BANNER_MS), NOW)).toBe(false);
    expect(copyIsOld(meta(0, STALE_BANNER_MS + 1), NOW)).toBe(true);
  });
  it("a download time in the future is not old (Review Focus 5)", () => {
    expect(copyIsOld(meta(0, -60_000), NOW)).toBe(false);
  });
});
