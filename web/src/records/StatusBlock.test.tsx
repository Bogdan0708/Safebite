import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionState } from "./types";
import type { WatchState } from "./useWatch";

const m = vi.hoisted(() => ({ setShortlisted: vi.fn(), setVisited: vi.fn() }));
vi.mock("./collection", () => m);
vi.mock("./useToday", () => ({ useToday: () => "2026-09-24" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { StatusBlock } from "./StatusBlock";

const AVA = { uid: "ava-uid", displayName: "Ava" };
const st = (over: Partial<CollectionState> = {}): CollectionState => ({ shortlisted: false, visited: false, updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: new Date(), version: 3, ...over });

function renderBlock(state: WatchState<CollectionState | null>, disabled = false) {
  return render(<StatusBlock householdId="home" rid="r1" author={AVA} state={state} disabled={disabled} onRetry={() => {}} />);
}

beforeEach(() => {
  m.setShortlisted.mockResolvedValue({ kind: "ok", value: 1 });
  m.setVisited.mockResolvedValue({ kind: "ok", value: 1 });
});
afterEach(() => vi.clearAllMocks());

describe("StatusBlock", () => {
  it("a missing document from the server means not shortlisted, not visited, base version 0", async () => {
    renderBlock({ status: "ready", value: null });
    expect(screen.queryByTestId("status-changed-by")).toBeNull();
    await userEvent.click(screen.getByTestId("shortlist-add"));
    expect(m.setShortlisted).toHaveBeenCalledWith("home", "r1", AVA, 0, true);
  });

  it("shows the stored state and who changed it last; Remove uses the stored version", async () => {
    renderBlock({ status: "ready", value: st({ shortlisted: true, visited: true, visitedOn: "2026-05-03" }) });
    expect(screen.getByTestId("shortlist-state")).toHaveTextContent("On shortlist");
    expect(screen.getByTestId("visited-state")).toHaveTextContent("Visited 3 May 2026");
    expect(screen.getByTestId("status-changed-by")).toHaveTextContent("Last changed by Bogdan");
    await userEvent.click(screen.getByTestId("shortlist-remove"));
    expect(m.setShortlisted).toHaveBeenCalledWith("home", "r1", AVA, 3, false);
  });

  it("Mark visited defaults to today, refuses a future date, and saves a past one", async () => {
    renderBlock({ status: "ready", value: st() });
    await userEvent.click(screen.getByTestId("visited-mark"));
    const input = screen.getByTestId("visited-date");
    expect(input).toHaveValue("2026-09-24");
    // jsdom sanitises partial date strings, so set the whole value at once.
    fireEvent.change(input, { target: { value: "2026-09-30" } });
    await userEvent.click(screen.getByTestId("visited-save"));
    expect(screen.getByTestId("visited-error")).toHaveTextContent("The visit date can't be in the future.");
    expect(m.setVisited).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "2026-09-20" } });
    await userEvent.click(screen.getByTestId("visited-save"));
    expect(m.setVisited).toHaveBeenCalledWith("home", "r1", AVA, 3, "2026-09-20");
    await waitFor(() => expect(screen.queryByTestId("visited-date")).toBeNull());
  });

  it("Change date starts from the stored date; Clear sends null", async () => {
    renderBlock({ status: "ready", value: st({ visited: true, visitedOn: "2026-05-03" }) });
    await userEvent.click(screen.getByTestId("visited-change"));
    expect(screen.getByTestId("visited-date")).toHaveValue("2026-05-03");
    await userEvent.click(screen.getByTestId("visited-cancel"));
    await userEvent.click(screen.getByTestId("visited-clear"));
    expect(m.setVisited).toHaveBeenCalledWith("home", "r1", AVA, 3, null);
  });

  it("a conflict shows the standard message and never retries by itself", async () => {
    m.setShortlisted.mockResolvedValue({ kind: "conflict" });
    renderBlock({ status: "ready", value: null });
    await userEvent.click(screen.getByTestId("shortlist-add"));
    await waitFor(() => expect(screen.getByTestId("status-outcome")).toHaveAttribute("data-kind", "conflict"));
    expect(m.setShortlisted).toHaveBeenCalledTimes(1);
  });

  it("a conflicted date save closes the editor so the current visited state is shown again", async () => {
    m.setVisited.mockResolvedValue({ kind: "conflict" });
    renderBlock({ status: "ready", value: st({ visited: true, visitedOn: "2026-05-03" }) });
    await userEvent.click(screen.getByTestId("visited-change"));
    expect(screen.getByTestId("visited-date")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("visited-save"));
    await waitFor(() => expect(screen.getByTestId("status-outcome")).toHaveAttribute("data-kind", "conflict"));
    expect(screen.queryByTestId("visited-date")).toBeNull();
    expect(screen.getByTestId("visited-state")).toHaveTextContent("Visited 3 May 2026");
  });

  it.each([
    ["cached", { status: "offline", value: null } as const, false],
    ["from a page that is offline", { status: "ready", value: null } as const, true],
  ])("disables every control when the state is %s", (_label, state, disabled) => {
    renderBlock(state, disabled);
    expect(screen.getByTestId("shortlist-add")).toBeDisabled();
    expect(screen.getByTestId("visited-mark")).toBeDisabled();
  });

  it("shows loading and errors instead of controls until the state is known", () => {
    renderBlock({ status: "loading" });
    expect(screen.queryByTestId("shortlist-add")).toBeNull();
    expect(screen.getByTestId("read-loading")).toBeInTheDocument();
    renderBlock({ status: "error", message: "boom" });
    expect(screen.getByTestId("read-error")).toHaveTextContent("boom");
  });
});
