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
  const [editingDate, setEditingDate] = useState<string | null>(null);
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

  async function saveDate() {
    if (editingDate === null) return;
    const problem = validateVisitedOn(editingDate, today);
    setDateError(problem);
    if (problem) return;
    if (await run(() => setVisited(householdId, rid, author, base, editingDate))) setEditingDate(null);
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
        {editingDate === null && current?.visited && current.visitedOn && (
          <>
            <span data-testid="visited-state">Visited {formatCalendarDate(current.visitedOn)}</span>
            <button type="button" data-testid="visited-change" disabled={locked} onClick={() => { setEditingDate(current.visitedOn ?? today); setDateError(null); }}>Change date</button>
            <button type="button" data-testid="visited-clear" disabled={locked} onClick={() => void run(() => setVisited(householdId, rid, author, base, null))}>Clear</button>
          </>
        )}
        {editingDate === null && !current?.visited && (
          <button type="button" data-testid="visited-mark" disabled={locked} onClick={() => { setEditingDate(today); setDateError(null); }}>Mark visited</button>
        )}
        {editingDate !== null && (
          <>
            <label>
              Visit date
              <input type="date" data-testid="visited-date" value={editingDate} max={today} onChange={(e) => setEditingDate(e.target.value)} />
            </label>
            <button type="button" data-testid="visited-save" disabled={locked} onClick={() => void saveDate()}>Save</button>
            <button type="button" data-testid="visited-cancel" disabled={busy} onClick={() => { setEditingDate(null); setDateError(null); }}>Cancel</button>
            {dateError && <span className="field-error" data-testid="visited-error">{dateError}</span>}
          </>
        )}
      </p>
      {current && <p className="hint" data-testid="status-changed-by">Last changed by {current.updatedByName}</p>}
      {outcome && <p role="alert" data-testid="status-outcome" data-kind={outcome}>{statusOutcomeMessage(outcome)}</p>}
    </section>
  );
}
