import { describe, expect, it } from "vitest";
import { deleteProgressText } from "./messages";

describe("deleteProgressText", () => {
  it("names every deletion step", () => {
    expect(deleteProgressText("marking")).toBe("Marking…");
    expect(deleteProgressText("sweeping")).toBe("Removing evidence…");
    expect(deleteProgressText("sweepingNotes")).toBe("Removing notes…");
    expect(deleteProgressText("removing")).toBe("Removing restaurant…");
  });
});
