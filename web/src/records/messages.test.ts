import { describe, expect, it } from "vitest";
import { deleteProgressText, finishOutcomeText } from "./messages";

describe("deleteProgressText", () => {
  it("names every deletion step", () => {
    expect(deleteProgressText("marking")).toBe("Marking…");
    expect(deleteProgressText("sweeping")).toBe("Removing evidence…");
    expect(deleteProgressText("sweepingNotes")).toBe("Removing notes…");
    expect(deleteProgressText("removing")).toBe("Removing restaurant…");
  });
});

describe("finishOutcomeText", () => {
  it("tells the member what to do when resuming a deletion fails", () => {
    expect(finishOutcomeText("offline")).toBe("You are offline. Connect, then tap Finish deleting.");
    expect(finishOutcomeText("notFound")).toBe("Already removed.");
    expect(finishOutcomeText("permission")).toContain("That change was refused.");
    expect(finishOutcomeText("failed")).toBe("Could not finish deleting. Tap Finish deleting to try again.");
    expect(finishOutcomeText("conflict")).toBe("Could not finish deleting. Tap Finish deleting to try again.");
  });
});
