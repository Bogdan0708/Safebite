import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "./types";
import type { WatchState } from "./useWatch";

const m = vi.hoisted(() => ({ addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("./notes", () => m);
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { NotesSection } from "./NotesSection";

const AVA = { uid: "ava-uid", displayName: "Ava" };
const note = (over: Partial<Note> & Pick<Note, "id">): Note => ({ text: "Staff were careful", authorUid: "ava-uid", authorName: "Ava", createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-01T10:00:00Z"), version: 1, ...over });

function renderSection(state: WatchState<Note[]>, disabled = false) {
  const view = render(<NotesSection householdId="home" rid="r1" author={AVA} state={state} disabled={disabled} onRetry={() => {}} />);
  return {
    ...view,
    update: (next: WatchState<Note[]>) => view.rerender(<NotesSection householdId="home" rid="r1" author={AVA} state={next} disabled={disabled} onRetry={() => {}} />),
  };
}

beforeEach(() => {
  m.addNote.mockResolvedValue({ kind: "ok", value: "new" });
  m.updateNote.mockResolvedValue({ kind: "ok", value: 2 });
  m.deleteNote.mockResolvedValue({ kind: "ok", value: undefined });
});
afterEach(() => vi.clearAllMocks());

describe("NotesSection", () => {
  it("says notes are not evidence, lists notes with authors, and offers controls only on the member's own", () => {
    renderSection({ status: "ready", value: [note({ id: "a" }), note({ id: "b", authorUid: "bogdan-uid", authorName: "Bogdan", version: 2 })] });
    expect(screen.getByTestId("notes-section")).toHaveTextContent("Personal notes. They are not evidence and don't change any checked date.");
    expect(screen.getByTestId("note-b")).toHaveTextContent("Bogdan");
    expect(screen.getByTestId("note-edited-b")).toBeInTheDocument();
    expect(screen.queryByTestId("note-edited-a")).toBeNull();
    expect(screen.getByTestId("note-edit-a")).toBeInTheDocument();
    expect(screen.queryByTestId("note-edit-b")).toBeNull();
    expect(screen.queryByTestId("note-delete-b")).toBeNull();
  });

  it("shows the empty state only from the server", () => {
    const view = renderSection({ status: "offline", value: [] });
    expect(screen.queryByTestId("notes-empty")).toBeNull();
    view.update({ status: "ready", value: [] });
    expect(screen.getByTestId("notes-empty")).toHaveTextContent("No notes yet.");
  });

  it("adds a trimmed note, refuses blank text, and keeps the draft when saving fails", async () => {
    renderSection({ status: "ready", value: [] });
    await userEvent.click(screen.getByTestId("note-add-save"));
    expect(screen.getByTestId("note-add-error")).toHaveTextContent("Write something first.");
    expect(m.addNote).not.toHaveBeenCalled();
    await userEvent.type(screen.getByTestId("note-add-text"), "  Asked about the fryer  ");
    expect(screen.getByTestId("note-add-counter")).toHaveTextContent("21 / 2000");
    m.addNote.mockResolvedValueOnce({ kind: "offline" });
    await userEvent.click(screen.getByTestId("note-add-save"));
    await waitFor(() => expect(screen.getByTestId("note-add-outcome")).toHaveAttribute("data-kind", "offline"));
    expect(screen.getByTestId("note-add-text")).toHaveValue("  Asked about the fryer  ");
    await userEvent.click(screen.getByTestId("note-add-save"));
    expect(m.addNote).toHaveBeenLastCalledWith("home", "r1", AVA, "Asked about the fryer");
    await waitFor(() => expect(screen.getByTestId("note-add-text")).toHaveValue(""));
  });

  it("edits with the version the member started from", async () => {
    renderSection({ status: "ready", value: [note({ id: "a", version: 4 })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    const box = screen.getByTestId("note-edit-text-a");
    await userEvent.clear(box);
    await userEvent.type(box, "Went back, still careful");
    await userEvent.click(screen.getByTestId("note-save-a"));
    expect(m.updateNote).toHaveBeenCalledWith("home", "r1", "a", 4, "Went back, still careful");
    await waitFor(() => expect(screen.queryByTestId("note-edit-text-a")).toBeNull());
  });

  it("an edit conflict shows the current text beside the draft; Keep mine writes with the version shown", async () => {
    const view = renderSection({ status: "ready", value: [note({ id: "a", version: 1 })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    await userEvent.clear(screen.getByTestId("note-edit-text-a"));
    await userEvent.type(screen.getByTestId("note-edit-text-a"), "My draft");
    view.update({ status: "ready", value: [note({ id: "a", version: 2, text: "Changed on the phone" })] });
    m.updateNote.mockResolvedValueOnce({ kind: "conflict" });
    await userEvent.click(screen.getByTestId("note-save-a"));
    await waitFor(() => expect(screen.getByTestId("note-conflict-a")).toBeInTheDocument());
    expect(screen.getByTestId("note-conflict-current-a")).toHaveTextContent("Changed on the phone");
    expect(screen.getByTestId("note-edit-text-a")).toHaveValue("My draft");
    await userEvent.click(screen.getByTestId("note-keep-mine-a"));
    expect(m.updateNote).toHaveBeenLastCalledWith("home", "r1", "a", 2, "My draft");
  });

  it("Use theirs drops the draft", async () => {
    const view = renderSection({ status: "ready", value: [note({ id: "a" })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    view.update({ status: "ready", value: [note({ id: "a", version: 2, text: "Theirs" })] });
    m.updateNote.mockResolvedValueOnce({ kind: "conflict" });
    await userEvent.click(screen.getByTestId("note-save-a"));
    await userEvent.click(await screen.findByTestId("note-use-theirs-a"));
    expect(screen.queryByTestId("note-edit-text-a")).toBeNull();
    expect(screen.getByTestId("note-a")).toHaveTextContent("Theirs");
  });

  it("locks the composer while its save is in flight, so nothing typed meanwhile is lost; success clears it", async () => {
    let finish!: (x: unknown) => void;
    m.addNote.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    renderSection({ status: "ready", value: [] });
    const box = screen.getByTestId("note-add-text");
    await userEvent.type(box, "First note");
    await userEvent.click(screen.getByTestId("note-add-save"));
    expect(box).toHaveAttribute("readonly");
    await userEvent.type(box, " plus more");
    expect(box).toHaveValue("First note");
    await act(async () => finish({ kind: "ok", value: "new" }));
    expect(m.addNote).toHaveBeenCalledWith("home", "r1", AVA, "First note");
    expect(box).toHaveValue("");
    expect(box).not.toHaveAttribute("readonly");
  });

  it("locks the edit box while its save is in flight; success closes the editor", async () => {
    let finish!: (x: unknown) => void;
    m.updateNote.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    renderSection({ status: "ready", value: [note({ id: "a" })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    const box = screen.getByTestId("note-edit-text-a");
    await userEvent.clear(box);
    await userEvent.type(box, "Saved revision");
    await userEvent.click(screen.getByTestId("note-save-a"));
    expect(box).toHaveAttribute("readonly");
    await userEvent.type(box, " plus more");
    expect(box).toHaveValue("Saved revision");
    await act(async () => finish({ kind: "ok", value: 2 }));
    expect(m.updateNote).toHaveBeenCalledWith("home", "r1", "a", 1, "Saved revision");
    expect(screen.queryByTestId("note-edit-text-a")).toBeNull();
  });

  it("locks the edit box while Keep mine is in flight; a failure unlocks it with the draft intact", async () => {
    const view = renderSection({ status: "ready", value: [note({ id: "a", version: 1 })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    const box = screen.getByTestId("note-edit-text-a");
    await userEvent.clear(box);
    await userEvent.type(box, "My draft");
    view.update({ status: "ready", value: [note({ id: "a", version: 2, text: "Changed on the phone" })] });
    m.updateNote.mockResolvedValueOnce({ kind: "conflict" });
    await userEvent.click(screen.getByTestId("note-save-a"));
    await waitFor(() => expect(screen.getByTestId("note-conflict-a")).toBeInTheDocument());
    expect(box).not.toHaveAttribute("readonly");
    let finish!: (x: unknown) => void;
    m.updateNote.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await userEvent.click(screen.getByTestId("note-keep-mine-a"));
    expect(box).toHaveAttribute("readonly");
    await userEvent.type(box, " plus more");
    expect(box).toHaveValue("My draft");
    await act(async () => finish({ kind: "offline" }));
    expect(screen.getByTestId("note-outcome-a")).toHaveAttribute("data-kind", "offline");
    expect(box).toHaveValue("My draft");
    expect(box).not.toHaveAttribute("readonly");
  });

  it("delete needs a confirmation bound to the version shown, and deletes that version", async () => {
    const view = renderSection({ status: "ready", value: [note({ id: "a", version: 1 })] });
    await userEvent.click(screen.getByTestId("note-delete-a"));
    expect(m.deleteNote).not.toHaveBeenCalled();
    act(() => view.update({ status: "ready", value: [note({ id: "a", version: 2, text: "Edited elsewhere" })] }));
    expect(screen.queryByTestId("note-delete-confirm-a")).toBeNull();
    await userEvent.click(screen.getByTestId("note-delete-a"));
    await userEvent.click(screen.getByTestId("note-delete-confirm-a"));
    expect(m.deleteNote).toHaveBeenCalledWith("home", "r1", "a", 2);
  });

  it("disables adding, editing and deleting while the page is offline", () => {
    renderSection({ status: "offline", value: [note({ id: "a" })] }, true);
    expect(screen.getByTestId("note-add-save")).toBeDisabled();
    expect(screen.getByTestId("note-edit-a")).toBeDisabled();
    expect(screen.getByTestId("note-delete-a")).toBeDisabled();
  });

  it("shows loading and errors from the notes listener", () => {
    renderSection({ status: "error", message: "boom" });
    expect(screen.getByTestId("read-error")).toHaveTextContent("boom");
  });
});
