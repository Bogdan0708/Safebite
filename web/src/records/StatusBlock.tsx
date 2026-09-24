import { useState } from "react";
import { setShortlisted, setVisited } from "./collection";
import { isData } from "./combine";
import { formatCalendarDate } from "./dates";
import { statusOutcomeMessage } from "./messages";
import { ReadStateNotice } from "./ReadStateNotice";
import type { WriteOutcome } from "./repository";
import type { Author, CollectionState } from "./types";
import { useToday } from "./useToday";
import type { WatchState } from "./useWatch";
import { validateVisitedOn } from "./validation";

interface Props {
  householdId: string;
  rid: string;
  author: Author;
  state: WatchState<CollectionState | null>;
  /** True when any listener on the page is cache-backed: writes need a connection. */
  disabled: boolean;
  onRetry: () => void;
}

/**
 * Household shortlist and visited state for one restaurant (spec §3.7). Never computes or shows
 * anything safety-related; visiting touches only the collection document.
 */
export function StatusBlock({ householdId, rid, author, state, disabled, onRetry }: Props) {
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  // The draft keeps the version it was opened at: a live snapshot never rebases it (audit F1).
  const [draft, setDraft] = useState<{ date: string; baseVersion: number } | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  if (!isData(state)) {
    return (
      <section className="status" data-testid="status-block">
        <ReadStateNotice state={state} onRetry={onRetry} />
      </section>
    );
  }

  const current = state.value;
  // A missing or cached document is only a safe base when it came from the server.
  const locked = disabled || busy || state.status !== "ready";
  const base = current?.version ?? 0;

  async function run(action: () => Promise<WriteOutcome<number>>): Promise<boolean> {
    setBusy(true);
    setOutcome(null);
    const result = await action();
    setBusy(false);
    if (result.kind !== "ok") setOutcome(result.kind);
    return result.kind === "ok";
  }

  function openDraft(date: string) {
    setDraft({ date, baseVersion: base });
    setDateError(null);
  }

  async function saveDate() {
    if (draft === null) return;
    const problem = validateVisitedOn(draft.date, today);
    setDateError(problem);
    if (problem) return;
    // Write against the version the draft was opened at, so a change another member made meanwhile
    // returns a conflict instead of being overwritten. Close the editor on any outcome, ok or not:
    // the current state is always shown, per the status-outcome message below.
    await run(() => setVisited(householdId, rid, author, draft.baseVersion, draft.date));
    setDraft(null);
  }

  return (
    <section className="status" data-testid="status-block">
      <p className="actions">
        {current?.shortlisted ? (
          <>
            <span data-testid="shortlist-state">On shortlist</span>
            <button type="button" data-testid="shortlist-remove" disabled={locked} onClick={() => void run(() => setShortlisted(householdId, rid, author, base, false))}>Remove</button>
          </>
        ) : (
          <button type="button" data-testid="shortlist-add" disabled={locked} onClick={() => void run(() => setShortlisted(householdId, rid, author, base, true))}>Add to shortlist</button>
        )}
      </p>
      <p className="actions">
        {draft === null && current?.visited && current.visitedOn && (
          <>
            <span data-testid="visited-state">Visited {formatCalendarDate(current.visitedOn)}</span>
            <button type="button" data-testid="visited-change" disabled={locked} onClick={() => openDraft(current.visitedOn ?? today)}>Change date</button>
            <button type="button" data-testid="visited-clear" disabled={locked} onClick={() => void run(() => setVisited(householdId, rid, author, base, null))}>Clear</button>
          </>
        )}
        {draft === null && !current?.visited && (
          <button type="button" data-testid="visited-mark" disabled={locked} onClick={() => openDraft(today)}>Mark visited</button>
        )}
        {draft !== null && (
          <>
            <label>
              Visit date
              <input type="date" data-testid="visited-date" value={draft.date} max={today} onChange={(e) => { const date = e.target.value; setDraft((d) => d && { ...d, date }); }} />
            </label>
            <button type="button" data-testid="visited-save" disabled={locked} onClick={() => void saveDate()}>Save</button>
            <button type="button" data-testid="visited-cancel" disabled={busy} onClick={() => { setDraft(null); setDateError(null); }}>Cancel</button>
            {dateError && <span className="field-error" data-testid="visited-error">{dateError}</span>}
          </>
        )}
      </p>
      {current && <p className="hint" data-testid="status-changed-by">Last changed by {current.updatedByName}</p>}
      {outcome && <p role="alert" data-testid="status-outcome" data-kind={outcome}>{statusOutcomeMessage(outcome)}</p>}
    </section>
  );
}
