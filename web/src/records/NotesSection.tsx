import { useState } from "react";
import { isData } from "./combine";
import { outcomeMessage } from "./messages";
import { addNote, deleteNote, updateNote } from "./notes";
import { ReadStateNotice } from "./ReadStateNotice";
import type { WriteOutcome } from "./repository";
import type { Author, Note } from "./types";
import type { WatchState } from "./useWatch";
import { LIMITS, validateNoteText } from "./validation";

interface Props {
  householdId: string;
  rid: string;
  author: Author;
  state: WatchState<Note[]>;
  /** True when any listener on the page is cache-backed: writes need a connection. */
  disabled: boolean;
  onRetry: () => void;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function noteMessage(kind: WriteOutcome["kind"], adding: boolean): string {
  if (kind === "notFound") return adding ? "This restaurant was deleted." : "This note was deleted.";
  if (kind === "conflict") return "This note changed on another device.";
  return outcomeMessage(kind, "This note");
}

/** Personal notes (spec §3.7). Never evidence: no kinds, no dates that feed evidence status. */
export function NotesSection({ householdId, rid, author, state, disabled, onRetry }: Props) {
  return (
    <section className="notes" data-testid="notes-section">
      <h3>Our notes</h3>
      <p className="hint">Personal notes. They are not evidence and don't change any checked date.</p>
      {!isData(state) && <ReadStateNotice state={state} onRetry={onRetry} />}
      <NoteComposer householdId={householdId} rid={rid} author={author} disabled={disabled} />
      {state.status === "ready" && state.value.length === 0 && <p data-testid="notes-empty">No notes yet.</p>}
      {isData(state) &&
        state.value.map((n) => (
          <NoteCard key={n.id} householdId={householdId} rid={rid} note={n} own={n.authorUid === author.uid} disabled={disabled} />
        ))}
    </section>
  );
}

function NoteComposer({ householdId, rid, author, disabled }: { householdId: string; rid: string; author: Author; disabled: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const problem = validateNoteText(text);
    setError(problem);
    setOutcome(null);
    if (problem) return;
    setBusy(true);
    const result = await addNote(householdId, rid, author, text.trim());
    setBusy(false);
    if (result.kind === "ok") {
      setText("");
      return;
    }
    setOutcome(result.kind); // the draft stays in the box
  }

  return (
    <div className="note-composer">
      <label>
        Add a note
        {/* Read-only while saving: the save sends the text as clicked, so later typing would be lost (audit F2). */}
        <textarea data-testid="note-add-text" value={text} rows={3} readOnly={busy} onChange={(e) => setText(e.target.value)} />
      </label>
      <span className="hint" data-testid="note-add-counter">{text.trim().length} / {LIMITS.note}</span>
      <button type="button" data-testid="note-add-save" disabled={disabled || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save note"}</button>
      {error && <span className="field-error" data-testid="note-add-error">{error}</span>}
      {outcome && <p role="alert" data-testid="note-add-outcome" data-kind={outcome}>{noteMessage(outcome, true)}</p>}
    </div>
  );
}

function NoteCard({ householdId, rid, note, own, disabled }: { householdId: string; rid: string; note: Note; own: boolean; disabled: boolean }) {
  const [editing, setEditing] = useState<{ draft: string; baseVersion: number } | null>(null);
  const [conflict, setConflict] = useState(false);
  // The version a pending delete confirmation belongs to (audit clarification, as claims in 37cc46b).
  const [confirming, setConfirming] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (confirming !== null && confirming !== note.version) setConfirming(null);

  async function save(baseVersion: number) {
    if (!editing) return;
    const problem = validateNoteText(editing.draft);
    setError(problem);
    setOutcome(null);
    if (problem) return;
    setBusy(true);
    const result = await updateNote(householdId, rid, note.id, baseVersion, editing.draft.trim());
    setBusy(false);
    if (result.kind === "ok") {
      setEditing(null);
      setConflict(false);
      return;
    }
    if (result.kind === "conflict") {
      setConflict(true);
      return;
    }
    setOutcome(result.kind); // the draft stays open
  }

  async function confirmDelete() {
    if (confirming === null) return;
    setBusy(true);
    const result = await deleteNote(householdId, rid, note.id, confirming);
    setBusy(false);
    if (result.kind !== "ok") {
      setConfirming(null);
      setOutcome(result.kind);
    }
  }

  function stopEditing() {
    setEditing(null);
    setConflict(false);
    setError(null);
  }

  return (
    <article className="card note" data-testid={`note-${note.id}`} data-version={note.version}>
      {!editing && <p className="note-text">{note.text}</p>}
      <p className="hint">
        {note.authorName} · {DATE.format(note.createdAt)}
        {note.version > 1 && <span data-testid={`note-edited-${note.id}`}> · edited</span>}
      </p>
      {editing && (
        <div className="note-editor">
          {/* Read-only while Save or Keep mine is in flight, as in the composer (audit F2). */}
          <textarea data-testid={`note-edit-text-${note.id}`} value={editing.draft} rows={3} readOnly={busy} onChange={(e) => setEditing({ ...editing, draft: e.target.value })} />
          {conflict ? (
            <div className="notice" role="status" data-testid={`note-conflict-${note.id}`}>
              <p>This note changed on another device. It now reads:</p>
              <blockquote data-testid={`note-conflict-current-${note.id}`}>{note.text}</blockquote>
              <div className="actions">
                <button type="button" data-testid={`note-keep-mine-${note.id}`} disabled={disabled || busy} onClick={() => void save(note.version)}>Keep mine</button>
                <button type="button" data-testid={`note-use-theirs-${note.id}`} disabled={busy} onClick={stopEditing}>Use theirs</button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button type="button" data-testid={`note-save-${note.id}`} disabled={disabled || busy} onClick={() => void save(editing.baseVersion)}>Save</button>
              <button type="button" data-testid={`note-cancel-${note.id}`} disabled={busy} onClick={stopEditing}>Cancel</button>
            </div>
          )}
          {error && <span className="field-error" data-testid={`note-error-${note.id}`}>{error}</span>}
        </div>
      )}
      {own && !editing && (
        <div className="actions">
          {confirming === null ? (
            <>
              <button type="button" data-testid={`note-edit-${note.id}`} disabled={disabled} onClick={() => { setEditing({ draft: note.text, baseVersion: note.version }); setOutcome(null); }}>Edit</button>
              <button type="button" data-testid={`note-delete-${note.id}`} disabled={disabled} onClick={() => { setConfirming(note.version); setOutcome(null); }}>Delete</button>
            </>
          ) : (
            <>
              <span>Delete this note?</span>
              <button type="button" data-testid={`note-delete-confirm-${note.id}`} disabled={disabled || busy} onClick={() => void confirmDelete()}>Yes, delete</button>
              <button type="button" data-testid={`note-delete-cancel-${note.id}`} disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
            </>
          )}
        </div>
      )}
      {outcome && <p role="alert" data-testid={`note-outcome-${note.id}`} data-kind={outcome}>{noteMessage(outcome, false)}</p>}
    </article>
  );
}
