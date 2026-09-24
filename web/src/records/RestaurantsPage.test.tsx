import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionState, Restaurant } from "./types";
import type { Snapshot } from "./repository";

const m = vi.hoisted(() => ({
  watchRestaurants: vi.fn(),
  watchCollection: vi.fn(),
  finishDeleting: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("./repository", () => ({ watchRestaurants: m.watchRestaurants, finishDeleting: m.finishDeleting }));
vi.mock("./collection", () => ({ watchCollection: m.watchCollection }));
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ state: { status: "member", uid: "ava-uid", email: "ava@safebite.test", householdId: "home", displayName: "Ava" }, signOut: m.signOut }),
}));

import { RestaurantsPage } from "./RestaurantsPage";

let emit: (s: Snapshot<Restaurant[]>) => void = () => {};
let emitState: (s: Snapshot<Record<string, CollectionState>>) => void = () => {};
beforeEach(() => {
  m.watchRestaurants.mockImplementation((_hid: string, cb: (s: Snapshot<Restaurant[]>) => void) => {
    emit = cb;
    return () => {};
  });
  // Existing tests assume an authoritative, empty collection unless a test says otherwise.
  m.watchCollection.mockImplementation((_hid: string, cb: (s: Snapshot<Record<string, CollectionState>>) => void) => {
    emitState = cb;
    cb({ status: "ready", value: {} });
    return () => {};
  });
  m.finishDeleting.mockResolvedValue({ kind: "ok", value: undefined });
});
afterEach(() => vi.clearAllMocks());

const r = (over: Partial<Restaurant> & Pick<Restaurant, "id" | "name">): Restaurant => ({
  address: "Somewhere 1",
  createdBy: "ava-uid",
  createdAt: new Date(),
  updatedAt: new Date(),
  version: 1,
  deleting: false,
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <RestaurantsPage />
    </MemoryRouter>,
  );
}

describe("RestaurantsPage", () => {
  it("shows loading, then the household's restaurants as links", async () => {
    renderPage();
    expect(screen.getByTestId("read-loading")).toBeInTheDocument();
    act(() => emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" }), r({ id: "b", name: "Zest" })] }));
    await userEvent.click(screen.getByTestId("filter-all"));
    const rows = screen.getAllByTestId("restaurant-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Da Marco");
    expect(rows[0]!.querySelector("a")).toHaveAttribute("href", "/restaurants/a");
    expect(screen.queryByTestId("restaurants-empty")).toBeNull();
  });

  it("renders the empty state only from an authoritative empty snapshot", () => {
    renderPage();
    act(() => emit({ status: "offline", value: [] }));
    expect(screen.queryByTestId("restaurants-empty")).toBeNull();
    expect(screen.getByTestId("read-offline")).toBeInTheDocument();
    act(() => emit({ status: "ready", value: [] }));
    expect(screen.getByTestId("restaurants-empty")).toBeInTheDocument();
  });

  it("disables Add while offline and shows the offline notice with the cached rows", async () => {
    renderPage();
    act(() => emit({ status: "offline", value: [r({ id: "a", name: "Da Marco" })] }));
    expect(screen.getByTestId("add-restaurant")).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByTestId("filter-all"));
    expect(screen.getByTestId("restaurant-row")).toHaveTextContent("Da Marco");
  });

  it("shows denied with a sign-out control, and error with retry that re-subscribes", async () => {
    renderPage();
    act(() => emit({ status: "denied" }));
    await userEvent.click(screen.getByTestId("signout-denied"));
    expect(m.signOut).toHaveBeenCalledTimes(1);
    act(() => emit({ status: "error", message: "boom" }));
    const before = m.watchRestaurants.mock.calls.length;
    await userEvent.click(screen.getByTestId("read-retry"));
    expect(m.watchRestaurants.mock.calls.length).toBe(before + 1);
  });

  it("resumes an interrupted deletion once per mount (even under StrictMode) and offers Finish deleting", async () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <RestaurantsPage />
        </MemoryRouter>
      </StrictMode>,
    );
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true, version: 4 })] }));
    const row = screen.getByTestId("restaurant-deleting");
    expect(row).toHaveTextContent("Deleting…");
    await waitFor(() => expect(m.finishDeleting).toHaveBeenCalledTimes(1));
    expect(m.finishDeleting).toHaveBeenCalledWith("home", "d", expect.any(Function));
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true, version: 4 })] }));
    expect(m.finishDeleting).toHaveBeenCalledTimes(1);
    m.finishDeleting.mockResolvedValueOnce({ kind: "offline" });
    await userEvent.click(screen.getByTestId("finish-deleting"));
    await waitFor(() => expect(m.finishDeleting).toHaveBeenCalledTimes(2));
    expect(row).toHaveTextContent("You are offline");
  });
});

const st = (over: Partial<CollectionState> = {}): CollectionState => ({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: new Date(), version: 1, ...over });

describe("RestaurantsPage — shortlist", () => {
  it("defaults to the shortlist with labels, and All records shows everything", async () => {
    renderPage();
    act(() => {
      emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" }), r({ id: "b", name: "Zest" })] });
      emitState({ status: "ready", value: { a: st({ visited: true, visitedOn: "2026-05-03" }) } });
    });
    expect(screen.getByTestId("filter-shortlist")).toHaveAttribute("aria-pressed", "true");
    const rows = screen.getAllByTestId("restaurant-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Da Marco");
    expect(screen.getByTestId("label-shortlisted")).toHaveTextContent("Shortlisted");
    expect(screen.getByTestId("label-visited")).toHaveTextContent("Visited 3 May 2026");
    await userEvent.click(screen.getByTestId("filter-all"));
    expect(screen.getAllByTestId("restaurant-row")).toHaveLength(2);
    expect(screen.getByTestId("filter-all")).toHaveAttribute("aria-pressed", "true");
  });

  it("distinguishes no records from an empty shortlist", () => {
    renderPage();
    act(() => emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" })] }));
    expect(screen.getByTestId("shortlist-empty")).toHaveTextContent("Nothing on the shortlist. Open a record and tap Add to shortlist.");
    expect(screen.queryByTestId("restaurants-empty")).toBeNull();
    act(() => emit({ status: "ready", value: [] }));
    expect(screen.getByTestId("restaurants-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("shortlist-empty")).toBeNull();
  });

  it("never shows an empty shortlist from a cached or failed collection snapshot", () => {
    renderPage();
    act(() => {
      emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" })] });
      emitState({ status: "offline", value: {} });
    });
    expect(screen.queryByTestId("shortlist-empty")).toBeNull();
    expect(screen.getAllByTestId("read-offline")).toHaveLength(1);
    act(() => emitState({ status: "error", message: "boom" }));
    expect(screen.getByTestId("read-error")).toHaveTextContent("boom");
    expect(screen.queryByTestId("shortlist-empty")).toBeNull();
  });

  it("shows one offline notice when both listeners are cache-backed", () => {
    renderPage();
    act(() => {
      emit({ status: "offline", value: [r({ id: "a", name: "Da Marco" })] });
      emitState({ status: "offline", value: { a: st() } });
    });
    expect(screen.getAllByTestId("read-offline")).toHaveLength(1);
    expect(screen.getByTestId("restaurant-row")).toHaveTextContent("Da Marco");
  });

  it("keeps deleting rows under the shortlist filter", () => {
    renderPage();
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true })] }));
    expect(screen.getByTestId("restaurant-deleting")).toHaveTextContent("Doomed");
  });

  it("explains a failed resume in words the member can act on", async () => {
    m.finishDeleting.mockResolvedValue({ kind: "failed", message: "x" });
    renderPage();
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true })] }));
    await waitFor(() => expect(screen.getByTestId("restaurant-deleting")).toHaveTextContent("Could not finish deleting. Tap Finish deleting to try again."));
  });
});
