import type { WriteOutcome } from "./repository";

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
