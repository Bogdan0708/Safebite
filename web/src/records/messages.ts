import type { DeleteStep, WriteOutcome } from "./repository";

/** One message per outcome kind; only `conflict` invites a reload (spec §3.5, audit F2). */
export function outcomeMessage(kind: WriteOutcome["kind"], what: string, verb: "save" | "delete" = "save"): string {
  switch (kind) {
    case "ok": return verb === "delete" ? `${what} deleted.` : `${what} saved.`;
    case "conflict": return `${what} was changed on another device. Reload the draft to see the latest, then apply your change again.`;
    case "notFound": return `${what} was deleted.`;
    case "permission": return "That change was refused. You may no longer have access to this household — try signing out and back in.";
    case "offline": return "You are offline. Connect and try again.";
    case "failed": return verb === "delete" ? `Could not delete ${what.toLowerCase()}. Try again.` : `Could not save ${what.toLowerCase()}. Try again.`;
  }
}

const DELETE_PROGRESS: Record<DeleteStep, string> = {
  marking: "Marking…",
  sweeping: "Removing evidence…",
  sweepingNotes: "Removing notes…",
  removing: "Removing restaurant…",
};

export function deleteProgressText(step: DeleteStep): string {
  return DELETE_PROGRESS[step];
}

/** Shortlist/visited writes: there is no draft to reload, the live state is already on screen. */
export function statusOutcomeMessage(kind: WriteOutcome["kind"]): string {
  switch (kind) {
    case "conflict": return "Someone else changed this at the same moment. The current state is shown; try again if you still want the change.";
    case "notFound": return "This restaurant was deleted.";
    default: return outcomeMessage(kind, "This change");
  }
}

/** The Saved page's "Finish deleting" outcomes (the parked Plan 2b resume wording). */
export function finishOutcomeText(kind: WriteOutcome["kind"]): string {
  switch (kind) {
    case "ok": return "";
    case "offline": return "You are offline. Connect, then tap Finish deleting.";
    case "notFound": return "Already removed.";
    case "permission": return outcomeMessage("permission", "This restaurant");
    case "conflict":
    case "failed": return "Could not finish deleting. Tap Finish deleting to try again.";
  }
}
