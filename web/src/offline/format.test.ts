import { describe, expect, it } from "vitest";
import { formatCopyTime } from "./format";

describe("formatCopyTime", () => {
  it("formats as day, short month and 24-hour time", () => {
    expect(formatCopyTime(new Date(2026, 9, 10, 14, 32).getTime())).toBe("10 Oct, 14:32");
  });
  it("pads the hour and minute and keeps the day unpadded", () => {
    expect(formatCopyTime(new Date(2026, 9, 9, 8, 5).getTime())).toBe("9 Oct, 08:05");
  });
});
